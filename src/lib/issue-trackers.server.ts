import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { integrations, pullIssues } from "@/db/schema";
import { getAppUrl } from "@/lib/app-url.server";
import { decryptSecret, encryptSecret } from "@/lib/crypto.server";
import {
	type IssueTrackerConfig,
	type IssueTrackerTarget,
	resultsAsJiraTable,
	resultsAsMarkdown,
} from "@/lib/issue-trackers";
import { createJiraIssue } from "@/lib/jira.server";
import { isPro } from "@/lib/plan";
import { getOrgPlan } from "@/lib/plan.server";

/**
 * Issue trackers: when a pull request breaks a required budget, Vitalgate
 * files one issue for it in each connected tracker: Linear and Jira
 * (jira.server.ts).
 *
 * Tokens live encrypted in integrations.encrypted_credentials and are
 * refreshed shortly before they expire (Linear's last 24 hours).
 */

interface OAuthCredentials {
	accessToken: string;
	refreshToken: string;
	/** Epoch ms. */
	expiresAt: number;
}

const LINEAR_API = "https://api.linear.app";

function linearClient() {
	const id = process.env.LINEAR_CLIENT_ID;
	const secret =
		process.env.LINEAR_CLIENT_SECRET ?? process.env.LINEAR_SECRET_KEY;
	if (!id || !secret) {
		throw new Error("Linear isn't set up on this server (LINEAR_CLIENT_ID)");
	}
	return { id, secret };
}

const linearRedirectUri = () =>
	`${getAppUrl()}/api/integrations/linear/callback`;

export function isLinearConfigured(): boolean {
	return Boolean(
		process.env.LINEAR_CLIENT_ID &&
			(process.env.LINEAR_CLIENT_SECRET ?? process.env.LINEAR_SECRET_KEY),
	);
}

export function getLinearAuthorizeUrl(state: string): string {
	const params = new URLSearchParams({
		client_id: linearClient().id,
		redirect_uri: linearRedirectUri(),
		response_type: "code",
		// read: list teams; issues:create: file issues, nothing broader.
		scope: "read,issues:create",
		state,
		prompt: "consent",
	});
	return `https://linear.app/oauth/authorize?${params}`;
}

async function linearToken(body: Record<string, string>) {
	const { id, secret } = linearClient();
	const res = await fetch(`${LINEAR_API}/oauth/token`, {
		method: "POST",
		headers: { "content-type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams({
			...body,
			client_id: id,
			client_secret: secret,
		}),
		signal: AbortSignal.timeout(10_000),
	});
	if (!res.ok) {
		throw new Error(`Linear token request failed (${res.status})`);
	}
	const json = (await res.json()) as {
		access_token: string;
		refresh_token: string;
		expires_in: number;
	};
	return {
		accessToken: json.access_token,
		refreshToken: json.refresh_token,
		expiresAt: Date.now() + json.expires_in * 1000,
	} satisfies OAuthCredentials;
}

async function linearGraphql<T>(
	accessToken: string,
	query: string,
	variables: Record<string, unknown> = {},
): Promise<T> {
	const res = await fetch(`${LINEAR_API}/graphql`, {
		method: "POST",
		headers: {
			"content-type": "application/json",
			authorization: `Bearer ${accessToken}`,
		},
		body: JSON.stringify({ query, variables }),
		signal: AbortSignal.timeout(10_000),
	});
	const json = (await res.json()) as {
		data?: T;
		errors?: { message: string }[];
	};
	if (!res.ok || json.errors?.length || !json.data) {
		throw new Error(
			`Linear API: ${json.errors?.[0]?.message ?? `HTTP ${res.status}`}`,
		);
	}
	return json.data;
}

/** OAuth callback: exchanges the code and stores the connection (no team chosen yet). */
export async function connectLinear(
	organizationId: string,
	code: string,
): Promise<void> {
	const creds = await linearToken({
		grant_type: "authorization_code",
		code,
		redirect_uri: linearRedirectUri(),
	});
	const { organization } = await linearGraphql<{
		organization: { name: string };
	}>(creds.accessToken, "query { organization { name } }");
	const values = {
		label: `Linear · ${organization.name}`,
		encryptedCredentials: encryptSecret(JSON.stringify(creds)),
		encryptedWebhookUrl: null,
		config: null,
	};
	await db
		.insert(integrations)
		.values({ organizationId, provider: "linear", ...values })
		.onConflictDoUpdate({
			target: [integrations.organizationId, integrations.provider],
			set: values,
		});
}

/**
 * A valid access token for the workspace's Linear connection, refreshing
 * (and saving) it when it's about to expire. Null if not connected.
 */
async function linearAccess(
	organizationId: string,
): Promise<{ accessToken: string; config: IssueTrackerConfig | null } | null> {
	const [row] = await db
		.select({
			id: integrations.id,
			encryptedCredentials: integrations.encryptedCredentials,
			config: integrations.config,
		})
		.from(integrations)
		.where(
			and(
				eq(integrations.organizationId, organizationId),
				eq(integrations.provider, "linear"),
			),
		)
		.limit(1);
	if (!row?.encryptedCredentials) return null;

	let creds = JSON.parse(
		decryptSecret(row.encryptedCredentials),
	) as OAuthCredentials;
	if (creds.expiresAt - Date.now() < 5 * 60_000) {
		creds = await linearToken({
			grant_type: "refresh_token",
			refresh_token: creds.refreshToken,
		});
		await db
			.update(integrations)
			.set({ encryptedCredentials: encryptSecret(JSON.stringify(creds)) })
			.where(eq(integrations.id, row.id));
	}
	return { accessToken: creds.accessToken, config: row.config };
}

/** The Linear teams the connection can file issues in, for the team picker. */
export async function listLinearTeams(
	organizationId: string,
): Promise<IssueTrackerTarget[]> {
	const access = await linearAccess(organizationId);
	if (!access) throw new Error("Linear isn't connected");
	const { teams } = await linearGraphql<{
		teams: { nodes: { id: string; name: string; key: string }[] };
	}>(
		access.accessToken,
		"query { teams(first: 100) { nodes { id name key } } }",
	);
	return teams.nodes.map((t) => ({ id: t.id, name: `${t.name} (${t.key})` }));
}

export async function setLinearTeam(
	organizationId: string,
	team: IssueTrackerTarget,
): Promise<void> {
	const teams = await listLinearTeams(organizationId);
	const match = teams.find((t) => t.id === team.id);
	if (!match) throw new Error("That team isn't available in Linear");
	await db
		.update(integrations)
		.set({
			config: { kind: "linear", teamId: match.id, teamName: match.name },
		})
		.where(
			and(
				eq(integrations.organizationId, organizationId),
				eq(integrations.provider, "linear"),
			),
		);
}

interface FailingPull {
	organizationId: string;
	pullId: string;
	repoFullName: string;
	prNumber: number;
	prTitle: string;
	/** The results table, as on the PR comment. */
	resultsMarkdown: string;
	pullUrl: string;
}

const issueSummary = (p: FailingPull) =>
	`Performance budget failed: ${p.repoFullName} #${p.prNumber}`.slice(0, 250);

const HEADLINE =
	"A required performance budget was exceeded (median of 3 Lighthouse lab runs).";

async function fileLinearIssue(p: FailingPull) {
	const access = await linearAccess(p.organizationId);
	if (access?.config?.kind !== "linear") return null;
	const prUrl = `https://github.com/${p.repoFullName}/pull/${p.prNumber}`;
	const { issueCreate } = await linearGraphql<{
		issueCreate: {
			success: boolean;
			issue: { identifier: string; url: string } | null;
		};
	}>(
		access.accessToken,
		`mutation ($input: IssueCreateInput!) {
			issueCreate(input: $input) { success issue { identifier url } }
		}`,
		{
			input: {
				teamId: access.config.teamId,
				title: issueSummary(p),
				description: [
					`**[${p.repoFullName} #${p.prNumber}](${prUrl})**: ${p.prTitle}`,
					"",
					HEADLINE,
					"",
					resultsAsMarkdown(p.resultsMarkdown),
					"",
					`[Full report on Vitalgate](${p.pullUrl})`,
				].join("\n"),
			},
		},
	);
	return issueCreate.success ? issueCreate.issue : null;
}

async function fileJiraIssue(p: FailingPull) {
	const prUrl = `https://github.com/${p.repoFullName}/pull/${p.prNumber}`;
	// Jira wiki markup: [text|url] links and a ||header|| table.
	const safeTitle = p.prTitle.replace(/[[\]{}|]/g, " ");
	return createJiraIssue(p.organizationId, {
		summary: issueSummary(p),
		description: [
			`[${p.repoFullName} #${p.prNumber}|${prUrl}]: ${safeTitle}`,
			"",
			HEADLINE,
			"",
			resultsAsJiraTable(p.resultsMarkdown),
			"",
			`[Full report on Vitalgate|${p.pullUrl}]`,
		].join("\n"),
	});
}

const TRACKERS = [
	{ provider: "linear", file: fileLinearIssue },
	{ provider: "jira", file: fileJiraIssue },
] as const;

/**
 * Called by /api/ingest when a pull request fails a required budget: files
 * one issue per PR in each connected tracker (Pro only). Never throws, so
 * a tracker outage can't fail the CI run.
 */
export async function fileIssuesForFailingPull(p: FailingPull): Promise<void> {
	try {
		if (!isPro(await getOrgPlan(p.organizationId))) return;
	} catch (err) {
		console.error("Filing tracker issues: plan lookup failed", err);
		return;
	}
	await Promise.allSettled(
		TRACKERS.map(async ({ provider, file }) => {
			try {
				const [existing] = await db
					.select({ id: pullIssues.id })
					.from(pullIssues)
					.where(
						and(
							eq(pullIssues.pullRequestId, p.pullId),
							eq(pullIssues.provider, provider),
						),
					)
					.limit(1);
				if (existing) return;
				const issue = await file(p);
				if (!issue) return;
				await db
					.insert(pullIssues)
					.values({
						pullRequestId: p.pullId,
						provider,
						identifier: issue.identifier,
						url: issue.url,
					})
					.onConflictDoNothing();
			} catch (err) {
				console.error(`Filing a ${provider} issue failed`, err);
			}
		}),
	);
}
