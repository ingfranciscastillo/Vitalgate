import { createServerFn } from "@tanstack/react-start";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { account, budgets, githubInstallations, repos } from "@/db/schema";
import { getAppUrl } from "@/lib/app-url.server";
import { auth } from "@/lib/auth";
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
	listGithubRepos,
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
 * Goes through better-auth rather than reading account.accessToken: the
 * column is encrypted (account.encryptOAuthTokens in auth.ts), and this also
 * refreshes the token if GitHub ever issues expiring ones.
 */
async function getGithubAccessToken(userId: string): Promise<string> {
	const [githubAccount] = await db
		.select({ id: account.id })
		.from(account)
		.where(and(eq(account.userId, userId), eq(account.providerId, "github")))
		.limit(1);

	const noAccount = new Error(
		"No GitHub account connected. Sign in with GitHub to connect repositories.",
	);
	if (!githubAccount) throw noAccount;

	const { accessToken } = await auth.api.getAccessToken({
		body: { accountId: githubAccount.id, userId },
	});
	if (!accessToken) throw noAccount;
	return accessToken;
}

/**
 * Every repo the workspace's GitHub App installations can access, keyed by
 * GitHub repo id, with the installation that grants it. Null when the
 * workspace hasn't installed the app yet — callers then fall back to the
 * user's OAuth token, until login stops requesting repo access.
 */
async function getInstallationRepos(
	organizationId: string,
): Promise<Map<string, { repo: GhRepo; installationId: string }> | null> {
	const installations = await db
		.select({ installationId: githubInstallations.installationId })
		.from(githubInstallations)
		.where(eq(githubInstallations.organizationId, organizationId));
	if (installations.length === 0) return null;

	const byRepoId = new Map<string, { repo: GhRepo; installationId: string }>();
	for (const { installationId } of installations) {
		const token = await getInstallationToken(installationId);
		for (const repo of await listInstallationRepos(token)) {
			byRepoId.set(repo.id, { repo, installationId });
		}
	}
	return byRepoId;
}

/** Token for GitHub calls about one connected repo: its app installation's, or the user's OAuth token for repos connected before the app. */
async function getRepoToken(
	repo: { installationId: string | null },
	userId: string,
): Promise<string> {
	return repo.installationId
		? getInstallationToken(repo.installationId)
		: getGithubAccessToken(userId);
}

export const getConnectableRepos = createServerFn({ method: "GET" }).handler(
	async (): Promise<GhRepo[]> => {
		const session = await ensureSession();
		const organizationId = session.session.activeOrganizationId;
		const appRepos = organizationId
			? await getInstallationRepos(organizationId)
			: null;
		if (appRepos) return [...appRepos.values()].map((r) => r.repo);
		return listGithubRepos(await getGithubAccessToken(session.user.id));
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
 * and dedupes. VITALGATE_TOKEN is already wired in separately, so a repeat
 * entry for it would just be a harmless no-op duplicate — still stripped to
 * keep the generated workflow's env block clean.
 */
function sanitizeEnvVarNames(names: string[] | undefined): string[] {
	if (!names) return [];
	const seen = new Set<string>();
	for (const raw of names) {
		const name = raw.trim();
		if (
			!name ||
			!ENV_VAR_NAME_PATTERN.test(name) ||
			name === "VITALGATE_TOKEN"
		) {
			continue;
		}
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
			githubRepoId: repo.githubRepoId,
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
		const { session, organizationId } = await requireOrgAdmin();

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
		const oauthToken = appRepos
			? null
			: await getGithubAccessToken(session.user.id);
		// Fixed public origin, not this request's Origin header: connecting from
		// a preview deployment must not bake a temporary URL into the user's repo.
		const vitalgateOrigin = getAppUrl();
		const presetBudgets = PRESET_BUDGETS[data.preset] ?? [];
		const envVarNames = sanitizeEnvVarNames(data.envVarNames);
		let connected = 0;
		let workflowsAdded = 0;
		let workflowsUpdated = 0;
		const workflowErrors: string[] = [];

		for (const requested of data.repos) {
			// With the app installed, only repos it was granted can connect, and
			// their details come from GitHub rather than from the browser.
			const appRepo = appRepos?.get(requested.id);
			if (appRepos && !appRepo) {
				workflowErrors.push(
					`${requested.fullName}: the Vitalgate GitHub App isn't installed on this repository`,
				);
				continue;
			}
			const repo = appRepo?.repo ?? requested;
			const installationId = appRepo?.installationId ?? null;
			const accessToken = installationId
				? await getInstallationToken(installationId)
				: (oauthToken as string);

			const [inserted] = await db
				.insert(repos)
				.values({
					organizationId,
					githubRepoId: repo.id,
					name: repo.name,
					fullName: repo.fullName,
					defaultBranch: repo.defaultBranch,
					private: repo.private,
					envVarNames,
					postPrComments: data.postComments ?? true,
					installationId,
				})
				.onConflictDoNothing({
					target: [repos.organizationId, repos.githubRepoId],
				})
				.returning({ id: repos.id });

			if (inserted) {
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
			} else {
				// Already connected to this org — "connecting" it again is how a
				// user regenerates the workflow (no separate disconnect flow yet),
				// so update the stored env var names and fall through to recommit
				// the workflow file below. Budgets are deliberately left untouched:
				// re-applying the preset here would clobber anything the user has
				// customized since.
				const [existing] = await db
					.update(repos)
					.set({
						envVarNames,
						postPrComments: data.postComments ?? true,
						installationId,
					})
					.where(
						and(
							eq(repos.organizationId, organizationId),
							eq(repos.githubRepoId, repo.id),
						),
					)
					.returning({ id: repos.id });
				if (!existing) continue; // shouldn't happen, but nothing to regenerate against
			}

			// Best-effort: a repo we can't write the workflow to (e.g. the OAuth
			// token doesn't cover it, or GitHub API hiccup) still stays connected
			// in Vitalgate — the user can add the workflow by hand.
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
					`${repo.fullName}: .github/workflows/budgetly.yml already exists and wasn't generated by Vitalgate, so it was left alone. Remove or rename it, then reconnect.`,
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
		const { session, organizationId } = await requireOrgAdmin();

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

		const accessToken = await getRepoToken(repo, session.user.id);
		const workflowResult = await regenerateWorkflow(
			accessToken,
			repo,
			envVarNames,
			getAppUrl(),
		);

		return { envVarNames, workflowResult };
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
		const { session, organizationId } = await requireOrgAdmin();

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

		const accessToken = await getRepoToken(repo, session.user.id);
		await deleteWorkflowFile(accessToken, repo.fullName);
	});
