import { and, desc, eq, gte } from "drizzle-orm";
import { db } from "@/db";
import {
	member,
	notificationPrefs,
	organization,
	pullRequests,
	repos,
	user,
} from "@/db/schema";
import { getAppUrl } from "@/lib/app-url.server";
import { sendEmail } from "@/lib/email.server";
import { escapeHtml } from "@/lib/html";
import type { PrStatus } from "@/lib/mock-data";

const DAY_MS = 24 * 60 * 60 * 1000;
/** Keeps the email readable on a busy day; the rest is one click away. */
const MAX_ROWS = 20;

interface DigestPull {
	id: string;
	repoFullName: string;
	number: number;
	title: string;
	status: PrStatus;
	perf: number | undefined;
}

export interface DailyDigestResult {
	email: string;
	organizationName: string;
	pulls: number;
	sent: boolean;
	error?: string;
}

const STATUS_LABEL: Record<PrStatus, string> = {
	failing: "❌ failing",
	warning: "⚠️ warning",
	passing: "✅ passing",
};

function renderDailyDigest(
	orgName: string,
	pulls: DigestPull[],
	total: number,
	appUrl: string,
): string {
	const failing = pulls.filter((p) => p.status === "failing").length;
	const rows = pulls
		.map(
			(p) => `
				<tr>
					<td style="padding: 6px 8px; font-family: monospace;"><a href="${appUrl}/pulls/${p.id}">${escapeHtml(p.repoFullName)} #${p.number}</a></td>
					<td style="padding: 6px 8px;">${escapeHtml(p.title)}</td>
					<td style="padding: 6px 8px; white-space: nowrap;">${STATUS_LABEL[p.status]}</td>
					<td style="padding: 6px 8px; text-align: right;">${p.perf ?? "—"}</td>
				</tr>`,
		)
		.join("");
	return `
		<div style="font-family: -apple-system, sans-serif; max-width: 640px; color: #111;">
			<h2 style="margin-bottom: 4px;">Your daily PR digest</h2>
			<p style="color: #666; margin-top: 0;">${escapeHtml(orgName)} — ${total} pull request${total === 1 ? "" : "s"} audited in the last 24 hours, ${failing} failing a required budget.</p>
			<table style="border-collapse: collapse; width: 100%; font-size: 13px;">
				<thead><tr style="text-align: left; color: #666;"><th style="padding: 6px 8px;">PR</th><th style="padding: 6px 8px;">Title</th><th style="padding: 6px 8px;">Result</th><th style="padding: 6px 8px; text-align: right;">Score</th></tr></thead>
				<tbody>${rows}</tbody>
			</table>
			${total > pulls.length ? `<p style="color: #666;">And ${total - pulls.length} more — <a href="${appUrl}/pulls">see all pull requests</a>.</p>` : ""}
			<p style="color: #666; font-size: 12px;">You get this because "Daily PR digest" is on in your Vitalgate notification settings.</p>
		</div>
	`;
}

/**
 * Emails each user who turned on "Daily PR digest" (off by default) the pull
 * requests audited in the last 24 hours, one email per Pro workspace they
 * belong to that had any. Called by /api/cron/daily-digest. Sequential and
 * per-recipient, so one failure doesn't stop the rest.
 */
export async function runDailyDigest(): Promise<DailyDigestResult[]> {
	const since = new Date(Date.now() - DAY_MS);
	const appUrl = getAppUrl();

	const subscribers = await db
		.select({
			email: user.email,
			organizationId: organization.id,
			organizationName: organization.name,
		})
		.from(notificationPrefs)
		.innerJoin(user, eq(notificationPrefs.userId, user.id))
		.innerJoin(member, eq(member.userId, user.id))
		.innerJoin(organization, eq(member.organizationId, organization.id))
		.where(
			and(
				eq(notificationPrefs.pref, "daily_digest"),
				eq(notificationPrefs.enabled, true),
				eq(organization.plan, "pro"),
			),
		);

	// Every subscriber in a workspace gets the same list; fetch it once.
	const pullsByOrg = new Map<string, DigestPull[]>();
	const results: DailyDigestResult[] = [];

	for (const sub of subscribers) {
		try {
			let pulls = pullsByOrg.get(sub.organizationId);
			if (!pulls) {
				const rows = await db
					.select({
						id: pullRequests.id,
						repoFullName: repos.fullName,
						number: pullRequests.number,
						title: pullRequests.title,
						status: pullRequests.status,
						metrics: pullRequests.metrics,
					})
					.from(pullRequests)
					.innerJoin(repos, eq(pullRequests.repoId, repos.id))
					.where(
						and(
							eq(repos.organizationId, sub.organizationId),
							gte(pullRequests.openedAt, since),
						),
					)
					.orderBy(desc(pullRequests.openedAt));
				pulls = rows.map(({ metrics, ...r }) => ({ ...r, perf: metrics.PERF }));
				pullsByOrg.set(sub.organizationId, pulls);
			}

			if (pulls.length === 0) {
				results.push({
					email: sub.email,
					organizationName: sub.organizationName,
					pulls: 0,
					sent: false,
				});
				continue;
			}

			await sendEmail({
				to: [sub.email],
				subject: `Vitalgate daily digest — ${sub.organizationName}`.replace(
					/[\r\n]+/g,
					" ",
				),
				html: renderDailyDigest(
					sub.organizationName,
					pulls.slice(0, MAX_ROWS),
					pulls.length,
					appUrl,
				),
			});
			results.push({
				email: sub.email,
				organizationName: sub.organizationName,
				pulls: pulls.length,
				sent: true,
			});
		} catch (error) {
			results.push({
				email: sub.email,
				organizationName: sub.organizationName,
				pulls: 0,
				sent: false,
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}

	return results;
}
