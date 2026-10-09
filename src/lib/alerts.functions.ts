import { createServerFn } from "@tanstack/react-start";
import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { alertReads, alerts, repos } from "@/db/schema";
import { ensureSession } from "@/lib/auth.functions";
import type { AlertChannel, AlertLevel } from "@/lib/mock-data";
import { idSchema, parseInput } from "@/lib/validation";

export interface OrgAlertItem {
	id: string;
	repoId: string;
	repoFullName: string;
	/** Channels the alert actually reached; empty if none. */
	deliveredTo: AlertChannel[];
	level: AlertLevel;
	/** Whether the signed-in user has read it (per user, not per workspace). */
	read: boolean;
	title: string;
	message: string;
	createdAt: string;
}

/**
 * Most recent alerts across every repo in the active org, as /api/ingest
 * recorded them, with where each one was delivered — a feed of what
 * actually happened, not a notification inbox with read/unread state.
 */
export const getOrgAlerts = createServerFn({ method: "GET" }).handler(
	async (): Promise<OrgAlertItem[]> => {
		const session = await ensureSession();
		const organizationId = session.session.activeOrganizationId;
		if (!organizationId) return [];

		const rows = await db
			.select({
				id: alerts.id,
				repoId: alerts.repoId,
				repoFullName: repos.fullName,
				deliveredTo: alerts.deliveredTo,
				level: alerts.level,
				title: alerts.title,
				message: alerts.message,
				createdAt: alerts.createdAt,
				readAt: alertReads.readAt,
			})
			.from(alerts)
			.innerJoin(repos, eq(alerts.repoId, repos.id))
			.leftJoin(
				alertReads,
				and(
					eq(alertReads.alertId, alerts.id),
					eq(alertReads.userId, session.user.id),
				),
			)
			.where(eq(repos.organizationId, organizationId))
			.orderBy(desc(alerts.createdAt))
			.limit(50);

		return rows.map(({ readAt, ...r }) => ({
			...r,
			read: readAt !== null,
			createdAt: r.createdAt.toISOString(),
		}));
	},
);

/**
 * Marks alerts as read for the signed-in user: the given ones, or every
 * alert in the active workspace when no ids are passed ("Mark all as read").
 * Only alerts from the active workspace's repos are accepted.
 */
export const markAlertsRead = createServerFn({ method: "POST" })
	.validator(
		parseInput(z.object({ alertIds: z.array(idSchema).max(200).optional() })),
	)
	.handler(async ({ data }) => {
		const session = await ensureSession();
		const organizationId = session.session.activeOrganizationId;
		if (!organizationId) return;

		const owned = await db
			.select({ id: alerts.id })
			.from(alerts)
			.innerJoin(repos, eq(alerts.repoId, repos.id))
			.where(
				data.alertIds
					? and(
							eq(repos.organizationId, organizationId),
							inArray(alerts.id, data.alertIds),
						)
					: eq(repos.organizationId, organizationId),
			);
		if (owned.length === 0) return;

		await db
			.insert(alertReads)
			.values(owned.map((a) => ({ userId: session.user.id, alertId: a.id })))
			.onConflictDoNothing();
	});
