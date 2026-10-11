import { createServerFn } from "@tanstack/react-start";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { account, githubInstallations, integrations, repos } from "@/db/schema";
import { ensureSession } from "@/lib/auth.functions";
import { decryptSecret, encryptSecret } from "@/lib/crypto.server";
import { getInstallUrl, isGithubAppConfigured } from "@/lib/github-app.server";
import {
	deleteIntegration,
	getDiscordAuthorizeUrl,
	getSlackAuthorizeUrl,
} from "@/lib/integrations.server";
import { signOAuthState } from "@/lib/oauth-state.server";
import { requireOrgAdmin } from "@/lib/org-access.server";
import {
	checkWebhookUrl,
	newSigningSecret,
	pingPayload,
	sendWebhook,
} from "@/lib/outgoing-webhook.server";
import { isPro, type Plan } from "@/lib/plan";
import { getOrgPlan } from "@/lib/plan.server";
import {
	integrationProviderSchema,
	oauthIntegrationProviderSchema,
	parseInput,
} from "@/lib/validation";

export interface IntegrationsOverview {
	github: {
		connected: boolean;
		repoCount: number;
		/** GitHub accounts that installed the Vitalgate GitHub App for this workspace. */
		installations: { accountLogin: string; accountType: string }[];
		/** False until the GITHUB_APP_* env vars are set on this deployment. */
		appConfigured: boolean;
	};
	slack: { connected: boolean; label: string | null };
	discord: { connected: boolean; label: string | null };
	webhook: { connected: boolean; label: string | null };
	/** Slack/Discord are Pro-only; the client uses this to show an upgrade prompt instead of a Connect button. */
	plan: Plan;
}

export const getIntegrationsOverview = createServerFn({
	method: "GET",
}).handler(async (): Promise<IntegrationsOverview> => {
	const session = await ensureSession();
	const organizationId = session.session.activeOrganizationId;

	const [[githubAccount], connected, orgRepos, plan, installations] =
		await Promise.all([
			db
				.select({ id: account.id })
				.from(account)
				.where(
					and(
						eq(account.userId, session.user.id),
						eq(account.providerId, "github"),
					),
				)
				.limit(1),
			organizationId
				? db
						.select({
							provider: integrations.provider,
							label: integrations.label,
						})
						.from(integrations)
						.where(eq(integrations.organizationId, organizationId))
				: Promise.resolve([]),
			organizationId
				? db
						.select({ id: repos.id })
						.from(repos)
						.where(eq(repos.organizationId, organizationId))
				: Promise.resolve([]),
			organizationId
				? getOrgPlan(organizationId)
				: Promise.resolve("free" as const),
			organizationId
				? db
						.select({
							accountLogin: githubInstallations.accountLogin,
							accountType: githubInstallations.accountType,
						})
						.from(githubInstallations)
						.where(eq(githubInstallations.organizationId, organizationId))
				: Promise.resolve([]),
		]);

	const byProvider = new Map(connected.map((r) => [r.provider, r.label]));

	return {
		github: {
			connected: !!githubAccount,
			repoCount: orgRepos.length,
			installations,
			appConfigured: isGithubAppConfigured(),
		},
		slack: {
			connected: byProvider.has("slack"),
			label: byProvider.get("slack") ?? null,
		},
		discord: {
			connected: byProvider.has("discord"),
			label: byProvider.get("discord") ?? null,
		},
		webhook: {
			connected: byProvider.has("webhook"),
			label: byProvider.get("webhook") ?? null,
		},
		plan,
	};
});

/** URL to redirect the browser to, to start the Slack/Discord OAuth flow for the active org. */
export const getIntegrationAuthorizeUrl = createServerFn({ method: "GET" })
	.validator(parseInput(oauthIntegrationProviderSchema))
	.handler(async ({ data: provider }): Promise<string> => {
		const { organizationId } = await requireOrgAdmin();

		const plan = await getOrgPlan(organizationId);
		if (!isPro(plan)) {
			throw new Error(
				"Slack and Discord alerts are a Pro feature. Upgrade to connect.",
			);
		}

		const state = signOAuthState(organizationId);
		return provider === "slack"
			? getSlackAuthorizeUrl(state)
			: getDiscordAuthorizeUrl(state);
	});

export const disconnectIntegration = createServerFn({ method: "POST" })
	.validator(parseInput(integrationProviderSchema))
	.handler(async ({ data: provider }) => {
		const { organizationId } = await requireOrgAdmin();

		await deleteIntegration(organizationId, provider);
	});

/** URL that starts the GitHub App installation for the active workspace. Owners and admins only. */
export const getGithubInstallUrl = createServerFn({ method: "GET" })
	.validator(parseInput(z.enum(["connect", "settings"])))
	.handler(async ({ data: returnTo }): Promise<string> => {
		const { organizationId } = await requireOrgAdmin();
		// Same signed, short-lived state as Slack/Discord: it tells
		// /api/github/setup which workspace started the install, and which
		// page to send the user back to.
		return getInstallUrl(signOAuthState(organizationId, returnTo));
	});

/**
 * Connects (or replaces) the workspace's outgoing webhook: checks the URL,
 * generates a new signing secret and stores both encrypted. Returns the
 * secret so the admin can set up verification right away. Pro only.
 */
export const connectWebhook = createServerFn({ method: "POST" })
	.validator(parseInput(z.object({ url: z.string().trim().max(2048) })))
	.handler(async ({ data }): Promise<{ secret: string }> => {
		const { organizationId } = await requireOrgAdmin();
		if (!isPro(await getOrgPlan(organizationId))) {
			throw new Error("Webhooks are a Pro feature. Upgrade to connect one.");
		}
		const url = checkWebhookUrl(data.url);
		if (typeof url === "string") throw new Error(url);

		const secret = newSigningSecret();
		const values = {
			label: url.host,
			encryptedWebhookUrl: encryptSecret(url.toString()),
			encryptedSigningSecret: encryptSecret(secret),
		};
		await db
			.insert(integrations)
			.values({ organizationId, provider: "webhook", ...values })
			.onConflictDoUpdate({
				target: [integrations.organizationId, integrations.provider],
				set: values,
			});
		return { secret };
	});

async function getWorkspaceWebhook(organizationId: string) {
	const [row] = await db
		.select({
			encryptedWebhookUrl: integrations.encryptedWebhookUrl,
			encryptedSigningSecret: integrations.encryptedSigningSecret,
		})
		.from(integrations)
		.where(
			and(
				eq(integrations.organizationId, organizationId),
				eq(integrations.provider, "webhook"),
			),
		)
		.limit(1);
	if (!row?.encryptedSigningSecret) throw new Error("No webhook is connected");
	return {
		url: decryptSecret(row.encryptedWebhookUrl),
		secret: decryptSecret(row.encryptedSigningSecret),
	};
}

/** The webhook's signing secret, for an admin setting up verification. */
export const getWebhookSecret = createServerFn({ method: "GET" }).handler(
	async (): Promise<string> => {
		const { organizationId } = await requireOrgAdmin();
		return (await getWorkspaceWebhook(organizationId)).secret;
	},
);

/** Sends a signed "ping" event and reports what the endpoint answered. */
export const sendTestWebhook = createServerFn({ method: "POST" }).handler(
	async (): Promise<{ status: number }> => {
		const { organizationId } = await requireOrgAdmin();
		const hook = await getWorkspaceWebhook(organizationId);
		try {
			const status = await sendWebhook({
				...hook,
				event: "ping",
				payload: pingPayload(organizationId),
			});
			return { status };
		} catch (err) {
			throw new Error(
				`Couldn't reach the webhook: ${err instanceof Error ? err.message : String(err)}`,
			);
		}
	},
);
