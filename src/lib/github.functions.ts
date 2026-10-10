import { createServerFn } from "@tanstack/react-start";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { budgets, githubInstallations, repos } from "@/db/schema";
import { getAppUrl } from "@/lib/app-url.server";
import { ensureSession } from "@/lib/auth.functions";
import { actionFor } from "@/lib/budgets";
import {
	type CommitWorkflowResult,
	commitWorkflowFile,
	deleteWorkflowFile,
	detectPackageManager,
	type GhRepo,
	getPackageJson,
	isYarnBerryLockfile,
	listInstallationRepos,
	pickServeScript,
} from "@/lib/github";
import { getInstallationToken } from "@/lib/github-app.server";
import type { Action, MetricKey, Severity } from "@/lib/mock-data";
import { requireOrgAdmin } from "@/lib/org-access.server";
import { FREE_REPO_LIMIT, isPro } from "@/lib/plan";
import { getOrgPlan } from "@/lib/plan.server";
import {
	connectRepositoriesSchema,
	envVarNamesSchema,
	idSchema,
	parseInput,
} from "@/lib/validation";
import { vitalgateWorkflowYaml } from "@/lib/workflow-template";

/**
 * Every repo the workspace's GitHub App installations can access, keyed by
 * GitHub repo id, with the installation that grants it. Empty when the
 * workspace hasn't installed the app yet.
 */
async function getInstallationRepos(
	organizationId: string,
): Promise<Map<string, { repo: GhRepo; installationId: string }>> {
	const installations = await db
		.select({ installationId: githubInstallations.installationId })
		.from(githubInstallations)
		.where(eq(githubInstallations.organizationId, organizationId));

	const byRepoId = new Map<string, { repo: GhRepo; installationId: string }>();
	for (const { installationId } of installations) {
		const token = await getInstallationToken(installationId);
		for (const repo of await listInstallationRepos(token)) {
			byRepoId.set(repo.id, { repo, installationId });
		}
	}
	return byRepoId;
}

export interface ConnectableRepos {
	repos: GhRepo[];
	/**
	 * True when the workspace hasn't installed the GitHub App yet — the
	 * connect page asks for that instead of listing repos.
	 */
	needsAppInstall: boolean;
}

export const getConnectableRepos = createServerFn({ method: "GET" }).handler(
	async (): Promise<ConnectableRepos> => {
		const session = await ensureSession();
		const organizationId = session.session.activeOrganizationId;
		const appRepos = organizationId
			? await getInstallationRepos(organizationId)
			: new Map();
		return {
			repos: [...appRepos.values()].map((r) => r.repo),
			needsAppInstall: appRepos.size === 0,
		};
	},
);

type PresetBudget = {
	metric: MetricKey;
	max: number;
	severity: Severity;
	action: Action;
};

/**
 * Budget preset values, kept server-side as the source of truth (the client
 * only sends the preset id). Mirrors the thresholds shown in the preset
 * descriptions in repositories/new.tsx; FCP/TBT aren't shown there but are
 * filled in proportionally so every connected repo gets all 5 measurable
 * metrics (no INP: Lighthouse lab runs can't measure it — see budgets.ts).
 */
const PRESET_BUDGETS: Record<string, PresetBudget[]> = {
	default: [
		{ metric: "LCP", max: 2500, severity: "fail", action: "block" },
		{ metric: "CLS", max: 0.1, severity: "warn", action: "comment" },
		{ metric: "FCP", max: 1800, severity: "warn", action: "comment" },
		{ metric: "TBT", max: 300, severity: "warn", action: "comment" },
		{ metric: "PERF", max: 90, severity: "fail", action: "block" },
	],
	strict: [
		{ metric: "LCP", max: 2000, severity: "fail", action: "block" },
		{ metric: "CLS", max: 0.05, severity: "warn", action: "comment" },
		{ metric: "FCP", max: 1500, severity: "warn", action: "comment" },
		{ metric: "TBT", max: 200, severity: "warn", action: "comment" },
		{ metric: "PERF", max: 95, severity: "fail", action: "block" },
	],
	relaxed: [
		{ metric: "LCP", max: 3500, severity: "warn", action: "comment" },
		{ metric: "CLS", max: 0.15, severity: "warn", action: "comment" },
		{ metric: "FCP", max: 2800, severity: "warn", action: "comment" },
		{ metric: "TBT", max: 500, severity: "warn", action: "comment" },
		{ metric: "PERF", max: 75, severity: "fail", action: "block" },
	],
	// "Configure budgets manually after connecting" — no rows written.
	custom: [],
};

const DEFAULT_PORT = 3000;
const FALLBACK_START_SCRIPT = "start"; // TODO: replace me — no start/preview/serve script was found

/** A GitHub Actions secret/env var name: letters, digits, underscores, not starting with a digit. */
const ENV_VAR_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * Cleans up user-typed env var names: trims, drops anything that isn't a
 * valid identifier (silently — this only controls which `secrets.<NAME>`
 * references get written into YAML we generate, not user-facing validation),
 * and dedupes.
 */
function sanitizeEnvVarNames(names: string[] | undefined): string[] {
	if (!names) return [];
	const seen = new Set<string>();
	for (const raw of names) {
		const name = raw.trim();
		if (!name || !ENV_VAR_NAME_PATTERN.test(name)) continue;
		seen.add(name);
	}
	return Array.from(seen);
}

interface RegenerateWorkflowRepo {
	/** GitHub's numeric repo id, e.g. "1357877390" — not the DB row id. */
	githubRepoId: string;
	fullName: string;
	defaultBranch: string;
}

/**
 * Detects package manager/start script/port fresh from the repo's own files
 * and (re)commits the workflow. Shared by connectRepositories (both the
 * brand-new and the already-connected/reconnect branches) and
 * updateRepoEnvVars, since neither startScript/port/packageManager is
 * persisted anywhere — each call re-derives them the same way a first
 * connect would, so a repo's own package.json staying the source of truth
 * doesn't drift from what's actually committed.
 */
async function regenerateWorkflow(
	accessToken: string,
	repo: RegenerateWorkflowRepo,
	envVarNames: string[],
	vitalgateOrigin: string,
	overrides: { startScript?: string; port?: number } = {},
): Promise<CommitWorkflowResult> {
	const packageManager = await detectPackageManager(accessToken, repo.fullName);
	const pkg = await getPackageJson(accessToken, repo.fullName);

	const startScript =
		overrides.startScript?.trim() ||
		pickServeScript(pkg?.scripts ?? {}) ||
		FALLBACK_START_SCRIPT;
	const port = overrides.port ?? DEFAULT_PORT;

	const pnpmVersionMatch = pkg?.packageManager?.match(/^pnpm@(.+)$/);
	const pnpmVersion = pnpmVersionMatch?.[1] ?? "latest";

	const yarnVersionMatch = pkg?.packageManager?.match(/^yarn@(.+)$/);
	const yarnVersion = yarnVersionMatch?.[1];
	const yarnIsBerry =
		packageManager === "yarn"
			? yarnVersion
				? !yarnVersion.startsWith("1.")
				: await isYarnBerryLockfile(accessToken, repo.fullName)
			: false;

	return commitWorkflowFile(
		accessToken,
		repo.fullName,
		vitalgateWorkflowYaml({
			defaultBranch: repo.defaultBranch,
			packageManager,
			pnpmVersion,
			yarnIsBerry,
			yarnVersion,
			startScript,
			port,
			envVarNames,
			vitalgateOrigin,
		}),
	);
}

export const connectRepositories = createServerFn({ method: "POST" })
	.validator(parseInput(connectRepositoriesSchema))
	.handler(async ({ data }) => {
		const { organizationId } = await requireOrgAdmin();

		const plan = await getOrgPlan(organizationId);
		if (!isPro(plan)) {
			const existing = await db
				.select({ githubRepoId: repos.githubRepoId })
				.from(repos)
				.where(eq(repos.organizationId, organizationId));
			const existingIds = new Set(existing.map((r) => r.githubRepoId));
			// Reconnecting an already-connected repo (to regenerate its workflow)
			// isn't a new connection, so it doesn't count against the limit.
			const newCount = data.repos.filter((r) => !existingIds.has(r.id)).length;
			if (existing.length + newCount > FREE_REPO_LIMIT) {
				throw new Error(
					`The Free plan includes ${FREE_REPO_LIMIT} repository. Upgrade to Pro to connect more.`,
				);
			}
		}

		const appRepos = await getInstallationRepos(organizationId);
		// Fixed public origin, not this request's Origin header: connecting from
		// a preview deployment must not bake a temporary URL into the user's repo.
		const vitalgateOrigin = getAppUrl();
		const presetBudgets = PRESET_BUDGETS[data.preset] ?? [];
		const typedEnvVarNames = sanitizeEnvVarNames(data.envVarNames);
		let connected = 0;
		let workflowsAdded = 0;
		let workflowsUpdated = 0;
		const workflowErrors: string[] = [];

		for (const requested of data.repos) {
			// Only repos the GitHub App was granted can connect, and their
			// details come from GitHub rather than from the browser.
			const appRepo = appRepos.get(requested.id);
			if (!appRepo) {
				workflowErrors.push(
					`${requested.fullName}: the Vitalgate GitHub App isn't installed on this repository`,
				);
				continue;
			}
			const { repo, installationId } = appRepo;
			const accessToken = await getInstallationToken(installationId);

			const [inserted] = await db
				.insert(repos)
				.values({
					organizationId,
					githubRepoId: repo.id,
					name: repo.name,
					fullName: repo.fullName,
					defaultBranch: repo.defaultBranch,
					private: repo.private,
					envVarNames: typedEnvVarNames,
					postPrComments: data.postComments ?? true,
					installationId,
				})
				.onConflictDoNothing({ target: repos.githubRepoId })
				.returning({ id: repos.id, envVarNames: repos.envVarNames });

			if (!inserted) {
				// Connecting is one-time (a connected repo's workflow is refreshed
				// from its Settings tab), and a repository belongs to one
				// workspace at a time.
				const [owner] = await db
					.select({ organizationId: repos.organizationId })
					.from(repos)
					.where(eq(repos.githubRepoId, repo.id))
					.limit(1);
				workflowErrors.push(
					owner?.organizationId === organizationId
						? `${repo.fullName}: already connected`
						: `${repo.fullName}: already connected to another Vitalgate workspace`,
				);
				continue;
			}
			const envVarNames = inserted.envVarNames;
			connected++;

			if (presetBudgets.length > 0) {
				await db.insert(budgets).values(
					presetBudgets.map((b) => ({
						repoId: inserted.id,
						metric: b.metric,
						max: b.max,
						// Only severity decides whether a run fails the check, so
						// "don't fail the check" means every budget is a warning.
						severity: data.branchProtect ? b.severity : "warn",
						action: actionFor(data.branchProtect ? b.severity : "warn"),
					})),
				);
			}

			// Best-effort: a repo we can't write the workflow to (e.g. a GitHub API
			// hiccup) still stays connected — the workflow can be regenerated from
			// the repo's Settings tab.
			const workflowResult = await regenerateWorkflow(
				accessToken,
				{
					githubRepoId: repo.id,
					fullName: repo.fullName,
					defaultBranch: repo.defaultBranch,
				},
				envVarNames,
				vitalgateOrigin,
				{ startScript: data.startScript, port: data.port },
			);
			if (workflowResult.status === "created") workflowsAdded++;
			if (workflowResult.status === "updated") workflowsUpdated++;
			if (workflowResult.status === "error") {
				workflowErrors.push(`${repo.fullName}: ${workflowResult.message}`);
			}
			if (workflowResult.status === "already-exists") {
				workflowErrors.push(
					`${repo.fullName}: .github/workflows/vitalgate.yml already exists and wasn't generated by Vitalgate, so it was left alone. Remove or rename it, then regenerate the workflow from the repo's Settings.`,
				);
			}
		}

		return { connected, workflowsAdded, workflowsUpdated, workflowErrors };
	});

/** Edits one already-connected repo's forwarded env var names and recommits its workflow — the Settings tab on a repo's detail page. */
export const updateRepoEnvVars = createServerFn({ method: "POST" })
	.validator(
		parseInput(z.object({ repoId: idSchema, envVarNames: envVarNamesSchema })),
	)
	.handler(async ({ data }) => {
		const { organizationId } = await requireOrgAdmin();

		// Scoped to the active org, not just the id — a UUID guess from
		// another org's repo must not be editable.
		const [repo] = await db
			.select({
				id: repos.id,
				githubRepoId: repos.githubRepoId,
				fullName: repos.fullName,
				defaultBranch: repos.defaultBranch,
				installationId: repos.installationId,
			})
			.from(repos)
			.where(
				and(
					eq(repos.id, data.repoId),
					eq(repos.organizationId, organizationId),
				),
			)
			.limit(1);
		if (!repo) throw new Error("Repository not found");

		const envVarNames = sanitizeEnvVarNames(data.envVarNames);
		await db.update(repos).set({ envVarNames }).where(eq(repos.id, repo.id));

		const accessToken = await getInstallationToken(repo.installationId);
		const workflowResult = await regenerateWorkflow(
			accessToken,
			repo,
			envVarNames,
			getAppUrl(),
		);

		return { envVarNames, workflowResult };
	});

/** Recommits a connected repo's workflow from the current template and its saved settings — the "Regenerate workflow" button on its Settings tab. */
export const regenerateRepoWorkflow = createServerFn({ method: "POST" })
	.validator(parseInput(idSchema))
	.handler(async ({ data: repoId }) => {
		const { organizationId } = await requireOrgAdmin();
		const [repo] = await db
			.select({
				githubRepoId: repos.githubRepoId,
				fullName: repos.fullName,
				defaultBranch: repos.defaultBranch,
				installationId: repos.installationId,
				envVarNames: repos.envVarNames,
			})
			.from(repos)
			.where(
				and(eq(repos.id, repoId), eq(repos.organizationId, organizationId)),
			)
			.limit(1);
		if (!repo) throw new Error("Repository not found");

		return regenerateWorkflow(
			await getInstallationToken(repo.installationId),
			repo,
			repo.envVarNames,
			getAppUrl(),
		);
	});

/**
 * Removes a repo from Vitalgate: the row (cascades to its budgets, PR
 * history, and alerts — see the schema's onDelete: "cascade" FKs) and, best
 * effort, the workflow file it committed. Deliberately hard-deletes rather
 * than soft-deleting/archiving: there's no "reconnect and get your old
 * budgets back" feature, disconnecting is meant to be a clean break.
 */
export const disconnectRepository = createServerFn({ method: "POST" })
	.validator(parseInput(idSchema))
	.handler(async ({ data: repoId }) => {
		const { organizationId } = await requireOrgAdmin();

		const [repo] = await db
			.delete(repos)
			.where(
				and(eq(repos.id, repoId), eq(repos.organizationId, organizationId)),
			)
			.returning({
				fullName: repos.fullName,
				installationId: repos.installationId,
			});
		if (!repo) throw new Error("Repository not found");

		const accessToken = await getInstallationToken(repo.installationId);
		await deleteWorkflowFile(accessToken, repo.fullName);
	});
