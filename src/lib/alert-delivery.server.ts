import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { integrations, member, notificationPrefs, user } from "@/db/schema";
import {
	type AlertContext,
	type AlertLinks,
	type AlertToDeliver,
	discordPayload,
	emailSubject,
	renderAlertEmail,
	slackPayload,
} from "@/lib/alert-messages";
import { getAppUrl } from "@/lib/app-url.server";
import { decryptSecret } from "@/lib/crypto.server";
import { sendEmailToEach } from "@/lib/email.server";
import type {
	AlertChannel,
	AlertLevel,
	IntegrationProvider,
	NotificationPrefKey,
} from "@/lib/mock-data";
import { alertsPayload, sendWebhook } from "@/lib/outgoing-webhook.server";
import { isPro } from "@/lib/plan";
import { getOrgPlan } from "@/lib/plan.server";

/** How long one Slack/Discord webhook call may take before it's abandoned. */
const WEBHOOK_TIMEOUT_MS = 5000;

/** Which per-user email preference governs an alert level; info alerts never email. */
const LEVEL_PREF: Partial<Record<AlertLevel, NotificationPrefKey>> = {
	critical: "critical_alerts",
	warning: "warning_alerts",
};

/** Must match the defaults in notification-prefs.functions.ts. */
const PREF_DEFAULT_ENABLED = true;

/**
 * Sends one run's alerts everywhere they should go and reports which
 * channels actually got them:
 * - Email: every org member whose notification preferences cover the
 *   alert's level (on every plan).
 * - Slack / Discord: the org's connected channel, Pro only — a downgraded
 *   org keeps its stored webhook but stops getting posts.
 *
 * Never throws. Delivery is best-effort: a slow or failing channel must not
 * fail the CI run that reported the metrics, so each channel is isolated and
 * failures are only logged.
 */
export async function deliverAlerts(
	alerts: AlertToDeliver[],
	ctx: AlertContext,
): Promise<AlertChannel[]> {
	if (alerts.length === 0) return [];

	const links = {
		pr: `https://github.com/${ctx.repoFullName}/pull/${ctx.prNumber}`,
		app: `${getAppUrl()}/pulls/${ctx.pullId}`,
	};

	const [plan, connected] = await Promise.all([
		getOrgPlan(ctx.organizationId),
		db
			.select({
				id: integrations.id,
				provider: integrations.provider,
				encryptedWebhookUrl: integrations.encryptedWebhookUrl,
				encryptedSigningSecret: integrations.encryptedSigningSecret,
			})
			.from(integrations)
			.where(eq(integrations.organizationId, ctx.organizationId)),
	]);

	const tasks: Promise<AlertChannel | null>[] = [
		deliverEmail(alerts, ctx, links),
	];
	if (isPro(plan)) {
		for (const integration of connected) {
			tasks.push(deliverWebhook(integration, alerts, ctx, links));
		}
	}

	const results = await Promise.allSettled(tasks);
	const delivered = new Set<AlertChannel>();
	for (const result of results) {
		if (result.status === "fulfilled" && result.value) {
			delivered.add(result.value);
		} else if (result.status === "rejected") {
			console.error("Alert delivery failed:", result.reason);
		}
	}
	return [...delivered];
}

// --- Email -------------------------------------------------------------------

async function deliverEmail(
	alerts: AlertToDeliver[],
	ctx: AlertContext,
	links: AlertLinks,
): Promise<AlertChannel | null> {
	const prefKeys = [
		...new Set(alerts.map((a) => LEVEL_PREF[a.level]).filter((p) => !!p)),
	] as NotificationPrefKey[];
	if (prefKeys.length === 0) return null;

	const [members, prefRows] = await Promise.all([
		db
			.select({ userId: user.id, email: user.email })
			.from(member)
			.innerJoin(user, eq(member.userId, user.id))
			.where(eq(member.organizationId, ctx.organizationId)),
		db
			.select({
				userId: notificationPrefs.userId,
				pref: notificationPrefs.pref,
				enabled: notificationPrefs.enabled,
			})
			.from(notificationPrefs)
			.innerJoin(member, eq(member.userId, notificationPrefs.userId))
			.where(
				and(
					eq(member.organizationId, ctx.organizationId),
					inArray(notificationPrefs.pref, prefKeys),
				),
			),
	]);
	const optedOut = new Set(
		prefRows.filter((r) => !r.enabled).map((r) => `${r.userId}:${r.pref}`),
	);
	const wants = (userId: string, alert: AlertToDeliver) => {
		const pref = LEVEL_PREF[alert.level];
		if (!pref) return false;
		return optedOut.has(`${userId}:${pref}`) ? false : PREF_DEFAULT_ENABLED;
	};

	// Members can differ in which levels they want, so group them by the
	// exact set of alerts they'll get and send each group its own email.
	const groups = new Map<
		string,
		{ emails: string[]; alerts: AlertToDeliver[] }
	>();
	for (const m of members) {
		const mine = alerts.filter((a) => wants(m.userId, a));
		if (mine.length === 0) continue;
		const key = mine.map((a) => alerts.indexOf(a)).join(",");
		const group = groups.get(key) ?? { emails: [], alerts: mine };
		group.emails.push(m.email);
		groups.set(key, group);
	}
	if (groups.size === 0) return null;

	for (const group of groups.values()) {
		await sendEmailToEach({
			to: [...new Set(group.emails)],
			subject: emailSubject(group.alerts, ctx),
			html: renderAlertEmail(group.alerts, ctx, links),
		});
	}
	return "email";
}

// --- Slack / Discord -----------------------------------------------------------

async function deliverWebhook(
	integration: {
		id: string;
		provider: IntegrationProvider;
		encryptedWebhookUrl: string;
		encryptedSigningSecret: string | null;
	},
	alerts: AlertToDeliver[],
	ctx: AlertContext,
	links: AlertLinks,
): Promise<AlertChannel | null> {
	const url = decryptSecret(integration.encryptedWebhookUrl);

	if (integration.provider === "webhook") {
		if (!integration.encryptedSigningSecret) return null;
		const status = await sendWebhook({
			url,
			secret: decryptSecret(integration.encryptedSigningSecret),
			event: "alerts.created",
			payload: alertsPayload(alerts, ctx, links),
		});
		if (status >= 200 && status < 300) return "webhook";
		// Unlike Slack and Discord, a 404 here may be a deploy in progress on
		// the receiver's side, so the webhook is kept.
		throw new Error(`Outgoing webhook responded ${status}`);
	}

	const body =
		integration.provider === "slack"
			? slackPayload(alerts, ctx, links)
			: discordPayload(alerts, ctx, links);

	const res = await fetch(url, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(body),
		signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
	});

	if (res.ok) return integration.provider;

	// The channel or app was deleted on their side: the webhook will never
	// work again, so drop it and let Settings show it as disconnected.
	if (res.status === 404 || res.status === 410) {
		await db.delete(integrations).where(eq(integrations.id, integration.id));
	}
	throw new Error(
		`${integration.provider} webhook responded ${res.status}: ${(await res.text()).slice(0, 200)}`,
	);
}
