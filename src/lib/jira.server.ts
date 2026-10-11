import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { integrations } from "@/db/schema";
import { getAppUrl } from "@/lib/app-url.server";
import { decryptSecret, encryptSecret } from "@/lib/crypto.server";
import type {
	IssueTrackerConfig,
	IssueTrackerTarget,
} from "@/lib/issue-trackers";

/**
 * Jira Cloud through an Atlassian OAuth 2.0 (3LO) app with resource-level
 * grants: the user authorizes one site, and tokens only work there. Access
 * tokens are short-lived and refresh tokens rotate, so every refresh's new
 * refresh token is saved.
 */

interface JiraCredentials {
	accessToken: string;
	refreshToken: string;
	/** Epoch ms. */
	expiresAt: number;
	cloudId: string;
	/** e.g. "https://acme.atlassian.net", for issue links. */
	siteUrl: string;
}

function jiraClient() {
	const id = process.env.JIRA_CLIENT_ID;
	const secret = process.env.JIRA_CLIENT_SECRET;
	if (!id || !secret) {
		throw new Error("Jira isn't set up on this server (JIRA_CLIENT_ID)");
	}
	return { id, secret };
}

const jiraRedirectUri = () => `${getAppUrl()}/api/integrations/jira/callback`;

export function isJiraConfigured(): boolean {
	return Boolean(process.env.JIRA_CLIENT_ID && process.env.JIRA_CLIENT_SECRET);
}

export function getJiraAuthorizeUrl(state: string): string {
	const params = new URLSearchParams({
		audience: "api.atlassian.com",
		client_id: jiraClient().id,
		// Read projects, create issues, and a refresh token.
		scope: "read:jira-work write:jira-work offline_access",
		redirect_uri: jiraRedirectUri(),
		state,
		response_type: "code",
		prompt: "consent",
	});
	return `https://auth.atlassian.com/authorize?${params}`;
}

async function jiraToken(body: Record<string, string>) {
	const { id, secret } = jiraClient();
	const res = await fetch("https://auth.atlassian.com/oauth/token", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ ...body, client_id: id, client_secret: secret }),
		signal: AbortSignal.timeout(10_000),
	});
	if (!res.ok) throw new Error(`Jira token request failed (${res.status})`);
	const json = (await res.json()) as {
		access_token: string;
		refresh_token: string;
		expires_in: number;
	};
	return {
		accessToken: json.access_token,
		refreshToken: json.refresh_token,
		expiresAt: Date.now() + json.expires_in * 1000,
	};
}

async function jiraApi<T>(
	creds: Pick<JiraCredentials, "accessToken" | "cloudId">,
	path: string,
	init: RequestInit = {},
): Promise<T> {
	const res = await fetch(
		`https://api.atlassian.com/ex/jira/${creds.cloudId}${path}`,
		{
			...init,
			headers: {
				authorization: `Bearer ${creds.accessToken}`,
				accept: "application/json",
				"content-type": "application/json",
			},
			signal: AbortSignal.timeout(10_000),
		},
	);
	if (!res.ok) {
		throw new Error(
			`Jira API ${path} responded ${res.status}: ${(await res.text()).slice(0, 200)}`,
		);
	}
	return (await res.json()) as T;
}

/** OAuth callback: exchanges the code, finds the authorized site and stores the connection. */
export async function connectJira(
	organizationId: string,
	code: string,
): Promise<void> {
	const tokens = await jiraToken({
		grant_type: "authorization_code",
		code,
		redirect_uri: jiraRedirectUri(),
	});
	const res = await fetch(
		"https://api.atlassian.com/oauth/token/accessible-resources",
		{
			headers: {
				authorization: `Bearer ${tokens.accessToken}`,
				accept: "application/json",
			},
			signal: AbortSignal.timeout(10_000),
		},
	);
	if (!res.ok) throw new Error(`Jira sites request failed (${res.status})`);
	const sites = (await res.json()) as {
		id: string;
		name: string;
		url: string;
		scopes: string[];
	}[];
	const site = sites.find((s) => s.scopes.includes("write:jira-work"));
	if (!site) throw new Error("No Jira site was authorized");

	const creds: JiraCredentials = {
		...tokens,
		cloudId: site.id,
		siteUrl: site.url,
	};
	const values = {
		label: `Jira · ${site.name}`,
		encryptedCredentials: encryptSecret(JSON.stringify(creds)),
		encryptedWebhookUrl: null,
		config: null,
	};
	await db
		.insert(integrations)
		.values({ organizationId, provider: "jira", ...values })
		.onConflictDoUpdate({
			target: [integrations.organizationId, integrations.provider],
			set: values,
		});
}

/** Valid credentials for the workspace's Jira connection, refreshed if needed. Null if not connected. */
export async function jiraAccess(organizationId: string): Promise<{
	creds: JiraCredentials;
	config: IssueTrackerConfig | null;
} | null> {
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
				eq(integrations.provider, "jira"),
			),
		)
		.limit(1);
	if (!row?.encryptedCredentials) return null;

	let creds = JSON.parse(
		decryptSecret(row.encryptedCredentials),
	) as JiraCredentials;
	if (creds.expiresAt - Date.now() < 5 * 60_000) {
		// Rotating refresh tokens: the old one stops working, so the new one
		// must be stored before anything else.
		creds = {
			...creds,
			...(await jiraToken({
				grant_type: "refresh_token",
				refresh_token: creds.refreshToken,
			})),
		};
		await db
			.update(integrations)
			.set({ encryptedCredentials: encryptSecret(JSON.stringify(creds)) })
			.where(eq(integrations.id, row.id));
	}
	return { creds, config: row.config };
}

/** Projects on the connected Jira site, for the project picker. */
export async function listJiraProjects(
	organizationId: string,
): Promise<IssueTrackerTarget[]> {
	const access = await jiraAccess(organizationId);
	if (!access) throw new Error("Jira isn't connected");
	const page = await jiraApi<{
		values: { id: string; key: string; name: string }[];
	}>(access.creds, "/rest/api/2/project/search?maxResults=100&orderBy=name");
	return page.values.map((p) => ({ id: p.key, name: `${p.name} (${p.key})` }));
}

/**
 * Sets the Jira project issues go to, and picks its issue type: Bug if the
 * project has one, otherwise Task, otherwise its first standard type.
 */
export async function setJiraProject(
	organizationId: string,
	projectKey: string,
): Promise<void> {
	const access = await jiraAccess(organizationId);
	if (!access) throw new Error("Jira isn't connected");
	const project = await jiraApi<{
		key: string;
		name: string;
		issueTypes: { id: string; name: string; subtask: boolean }[];
	}>(access.creds, `/rest/api/2/project/${encodeURIComponent(projectKey)}`);
	const types = project.issueTypes.filter((t) => !t.subtask);
	const issueType =
		types.find((t) => t.name === "Bug") ??
		types.find((t) => t.name === "Task") ??
		types[0];
	if (!issueType) throw new Error("That project has no issue types to use");
	await db
		.update(integrations)
		.set({
			config: {
				kind: "jira",
				projectKey: project.key,
				projectName: `${project.name} (${project.key})`,
				issueTypeId: issueType.id,
			},
		})
		.where(
			and(
				eq(integrations.organizationId, organizationId),
				eq(integrations.provider, "jira"),
			),
		);
}

/** Creates the issue; returns its key and browser URL. */
export async function createJiraIssue(
	organizationId: string,
	issue: { summary: string; description: string },
): Promise<{ identifier: string; url: string } | null> {
	const access = await jiraAccess(organizationId);
	if (access?.config?.kind !== "jira") return null;
	const created = await jiraApi<{ key: string }>(
		access.creds,
		"/rest/api/2/issue",
		{
			method: "POST",
			body: JSON.stringify({
				fields: {
					project: { key: access.config.projectKey },
					issuetype: { id: access.config.issueTypeId },
					summary: issue.summary.slice(0, 250),
					description: issue.description,
				},
			}),
		},
	);
	return {
		identifier: created.key,
		url: `${access.creds.siteUrl}/browse/${created.key}`,
	};
}
