import { createServerFn } from "@tanstack/react-start";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { alerts, repos } from "@/db/schema";
import { ensureSession } from "@/lib/auth.functions";
import type { AlertChannel, AlertLevel } from "@/lib/mock-data";

export interface OrgAlertItem {
	id: string;
	repoId: string;
	repoFullName: string;
	/** Channels the alert actually reached; empty if none. */
	deliveredTo: AlertChannel[];
	level: AlertLevel;
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
			})
			.from(alerts)
			.innerJoin(repos, eq(alerts.repoId, repos.id))
			.where(eq(repos.organizationId, organizationId))
			.orderBy(desc(alerts.createdAt))
			.limit(50);

		return rows.map((r) => ({
			...r,
			createdAt: r.createdAt.toISOString(),
		}));
	},
);
