import { createServerFn } from "@tanstack/react-start";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { account, integrations, repos } from "@/db/schema";
import { getOrgAlertRules } from "@/lib/alert-rules.server";
import { ensureSession } from "@/lib/auth.functions";
import {
	deleteIntegration,
	getDiscordAuthorizeUrl,
	getSlackAuthorizeUrl,
} from "@/lib/integrations.server";
import type { IntegrationProvider } from "@/lib/mock-data";
import { signOAuthState } from "@/lib/oauth-state.server";
import { requireOrgAdmin } from "@/lib/org-access.server";
import { isPro, type Plan } from "@/lib/plan";
import { getOrgPlan } from "@/lib/plan.server";

export interface IntegrationsOverview {
	github: { connected: boolean; repoCount: number };
	slack: { connected: boolean; label: string | null };
	discord: { connected: boolean; label: string | null };
	/** Whether the org's weekly_digest alert rule is on — actual control lives on /alerts, this just reflects it. */
	emailDigest: { enabled: boolean };
	/** Slack/Discord are Pro-only; the client uses this to show an upgrade prompt instead of a Connect button. */
	plan: Plan;
}

export const getIntegrationsOverview = createServerFn({
	method: "GET",
}).handler(async (): Promise<IntegrationsOverview> => {
	const session = await ensureSession();
	const organizationId = session.session.activeOrganizationId;

	const [[githubAccount], connected, orgRepos, rules, plan] = await Promise.all(
		[
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
			organizationId ? getOrgAlertRules(organizationId) : Promise.resolve([]),
			organizationId
				? getOrgPlan(organizationId)
				: Promise.resolve("free" as const),
		],
	);

	const byProvider = new Map(connected.map((r) => [r.provider, r.label]));

	return {
		github: { connected: !!githubAccount, repoCount: orgRepos.length },
		slack: {
			connected: byProvider.has("slack"),
			label: byProvider.get("slack") ?? null,
		},
		discord: {
			connected: byProvider.has("discord"),
			label: byProvider.get("discord") ?? null,
		},
		emailDigest: {
			enabled: rules.find((r) => r.key === "weekly_digest")?.enabled ?? false,
		},
		plan,
	};
});

/** URL to redirect the browser to, to start the Slack/Discord OAuth flow for the active org. */
export const getIntegrationAuthorizeUrl = createServerFn({ method: "GET" })
	.validator((provider: IntegrationProvider) => provider)
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
	.validator((provider: IntegrationProvider) => provider)
	.handler(async ({ data: provider }) => {
		const { organizationId } = await requireOrgAdmin();

		await deleteIntegration(organizationId, provider);
	});
