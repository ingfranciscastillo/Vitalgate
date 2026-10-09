import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db";
import {
	alertRules,
	alerts,
	member,
	organization,
	pullRequests,
	repos,
	user,
} from "@/db/schema";
import { getAppUrl } from "@/lib/app-url.server";
import { sendEmail } from "@/lib/email.server";
import { escapeHtml } from "@/lib/html";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

interface WeeklyStats {
	prsAnalyzed: number;
	failingPrs: number;
	alertsFired: number;
	avgPerf: number | null;
}

async function getWeeklyStats(organizationId: string): Promise<WeeklyStats> {
	const since = new Date(Date.now() - SEVEN_DAYS_MS);

	const [prRow] = await db
		.select({
			total: sql<string>`count(*)`,
			failing: sql<string>`count(*) filter (where ${pullRequests.status} = 'failing')`,
			avgPerf: sql<
				string | null
			>`avg((${pullRequests.metrics}->>'PERF')::numeric)`,
		})
		.from(pullRequests)
		.innerJoin(repos, eq(pullRequests.repoId, repos.id))
		.where(
			and(
				eq(repos.organizationId, organizationId),
				gte(pullRequests.openedAt, since),
			),
		);

	const [alertRow] = await db
		.select({ total: sql<string>`count(*)` })
		.from(alerts)
		.innerJoin(repos, eq(alerts.repoId, repos.id))
		.where(
			and(
				eq(repos.organizationId, organizationId),
				gte(alerts.createdAt, since),
			),
		);

	return {
		prsAnalyzed: Number(prRow?.total ?? 0),
		failingPrs: Number(prRow?.failing ?? 0),
		alertsFired: Number(alertRow?.total ?? 0),
		avgPerf: prRow?.avgPerf != null ? Math.round(Number(prRow.avgPerf)) : null,
	};
}

async function getOrgMemberEmails(organizationId: string): Promise<string[]> {
	const rows = await db
		.select({ email: user.email })
		.from(member)
		.innerJoin(user, eq(member.userId, user.id))
		.where(eq(member.organizationId, organizationId));
	return Array.from(new Set(rows.map((r) => r.email)));
}

function renderDigestEmail(
	orgName: string,
	stats: WeeklyStats,
	appUrl: string,
): string {
	return `
		<div style="font-family: -apple-system, sans-serif; max-width: 480px; color: #111;">
			<h2 style="margin-bottom: 4px;">Vitalgate weekly digest</h2>
			<p style="color: #666; margin-top: 0;">${escapeHtml(orgName)} — last 7 days</p>
			<ul style="line-height: 1.8;">
				<li><strong>${stats.prsAnalyzed}</strong> pull request${stats.prsAnalyzed === 1 ? "" : "s"} analyzed</li>
				<li><strong>${stats.failingPrs}</strong> failed a required budget</li>
				<li><strong>${stats.alertsFired}</strong> alert${stats.alertsFired === 1 ? "" : "s"} fired</li>
				${stats.avgPerf != null ? `<li>Average performance score: <strong>${stats.avgPerf}</strong></li>` : ""}
			</ul>
			<p><a href="${appUrl}/alerts">View alerts on Vitalgate →</a></p>
		</div>
	`;
}

export interface WeeklyDigestResult {
	organizationId: string;
	organizationName: string;
	recipients: number;
	sent: boolean;
	error?: string;
}

/**
 * Sends the weekly digest email to every org that has the rule enabled.
 * Called by /api/cron/weekly-digest. Doesn't write an `alerts` row — that
 * table is scoped to one repo per row (NOT NULL repoId), but a digest is
 * org-wide; the email itself is the notification here, the same way the
 * other three rules use the /alerts feed because they have no delivery
 * channel of their own yet.
 */
export async function runWeeklyDigest(): Promise<WeeklyDigestResult[]> {
	const orgRows = await db
		.select({
			organizationId: alertRules.organizationId,
			organizationName: organization.name,
		})
		.from(alertRules)
		.innerJoin(organization, eq(alertRules.organizationId, organization.id))
		.where(
			and(eq(alertRules.rule, "weekly_digest"), eq(alertRules.enabled, true)),
		);

	const appUrl = getAppUrl();
	const results: WeeklyDigestResult[] = [];

	// Sequential, not Promise.all — gentle on Resend's rate limits, and a
	// single org's failure (e.g. no verified domain yet) shouldn't abort the
	// rest.
	for (const org of orgRows) {
		try {
			const [stats, emails] = await Promise.all([
				getWeeklyStats(org.organizationId),
				getOrgMemberEmails(org.organizationId),
			]);

			if (emails.length === 0) {
				results.push({
					organizationId: org.organizationId,
					organizationName: org.organizationName,
					recipients: 0,
					sent: false,
					error: "No members to send to",
				});
				continue;
			}

			await sendEmail({
				to: emails,
				subject: `Vitalgate weekly digest — ${org.organizationName}`,
				html: renderDigestEmail(org.organizationName, stats, appUrl),
			});

			results.push({
				organizationId: org.organizationId,
				organizationName: org.organizationName,
				recipients: emails.length,
				sent: true,
			});
		} catch (error) {
			results.push({
				organizationId: org.organizationId,
				organizationName: org.organizationName,
				recipients: 0,
				sent: false,
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}

	return results;
}
