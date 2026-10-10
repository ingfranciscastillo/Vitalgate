import { createServerFn } from "@tanstack/react-start";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { notificationPrefs } from "@/db/schema";
import { ensureSession } from "@/lib/auth.functions";
import type { NotificationPrefKey } from "@/lib/mock-data";
import { notificationPrefKeySchema, parseInput } from "@/lib/validation";

interface NotificationPrefMeta {
	key: NotificationPrefKey;
	label: string;
	desc: string;
	defaultEnabled: boolean;
}

/**
 * Read by alert delivery (critical_alerts, warning_alerts), the weekly
 * digest (weekly_summary) and the daily digest (daily_digest); each of those
 * mirrors the defaultEnabled below. Global per user, not scoped to the
 * active org: these read as personal preferences ("email me"), not an org
 * policy.
 */
const NOTIFICATION_PREFS: NotificationPrefMeta[] = [
	{
		key: "critical_alerts",
		label: "Email me on critical alerts",
		desc: "A required budget was violated on a repo you have access to.",
		defaultEnabled: true,
	},
	{
		key: "warning_alerts",
		label: "Email me on warnings",
		desc: "A soft budget was crossed, or a 3-day regression was caught.",
		defaultEnabled: true,
	},
	{
		key: "daily_digest",
		label: "Daily PR digest",
		desc: "Every morning, the pull requests audited in the last 24 hours. Pro workspaces.",
		defaultEnabled: false,
	},
	{
		key: "weekly_summary",
		label: "Weekly digest",
		desc: "Your workspace's weekly summary, when an admin turns it on under Alerts. Pro workspaces.",
		defaultEnabled: true,
	},
];

export interface NotificationPrefItem extends NotificationPrefMeta {
	enabled: boolean;
}

/** Every known preference for the signed-in user, with its stored on/off state (or the preference's default, if never toggled). */
export const getNotificationPrefs = createServerFn({ method: "GET" }).handler(
	async (): Promise<NotificationPrefItem[]> => {
		const session = await ensureSession();

		const rows = await db
			.select({
				pref: notificationPrefs.pref,
				enabled: notificationPrefs.enabled,
			})
			.from(notificationPrefs)
			.where(eq(notificationPrefs.userId, session.user.id));
		const overrides = new Map(rows.map((r) => [r.pref, r.enabled]));

		return NOTIFICATION_PREFS.map((p) => ({
			...p,
			enabled: overrides.get(p.key) ?? p.defaultEnabled,
		}));
	},
);

export const setNotificationPref = createServerFn({ method: "POST" })
	.validator(
		parseInput(
			z.object({ pref: notificationPrefKeySchema, enabled: z.boolean() }),
		),
	)
	.handler(async ({ data }) => {
		const session = await ensureSession();

		await db
			.insert(notificationPrefs)
			.values({
				userId: session.user.id,
				pref: data.pref,
				enabled: data.enabled,
			})
			.onConflictDoUpdate({
				target: [notificationPrefs.userId, notificationPrefs.pref],
				set: { enabled: data.enabled },
			});
	});
