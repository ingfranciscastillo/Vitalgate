import { and, asc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import {
	lifecycleEmails,
	member,
	notificationPrefs,
	pullRequests,
	repos,
	user,
} from "@/db/schema";
import { getAppUrl } from "@/lib/app-url.server";
import { sendEmail } from "@/lib/email.server";
import {
	connectNudgeEmail,
	firstAuditEmail,
	type LifecycleEmail,
	prNudgeEmail,
	welcomeEmail,
} from "@/lib/lifecycle-emails";
import type { PrStatus } from "@/lib/mock-data";
import { isAdminRole } from "@/lib/roles";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Sends `email` once per `key`: the key is claimed first, so a retried cron
 * or a concurrent request can't send it twice, and released if sending
 * fails so the next run tries again. Replies go to CONTACT_EMAIL.
 */
async function sendOnce(
	key: string,
	to: string,
	email: LifecycleEmail,
): Promise<boolean> {
	const [claimed] = await db
		.insert(lifecycleEmails)
		.values({ key })
		.onConflictDoNothing()
		.returning({ key: lifecycleEmails.key });
	if (!claimed) return false;
	try {
		await sendEmail({
			to: [to],
			subject: email.subject,
			html: email.html,
			replyTo: process.env.CONTACT_EMAIL || undefined,
		});
		return true;
	} catch (err) {
		await db.delete(lifecycleEmails).where(eq(lifecycleEmails.key, key));
		throw err;
	}
}

/** Users who turned "Getting started tips" off; it's on by default. */
async function tipsOptedOut(userIds: string[]): Promise<Set<string>> {
	if (userIds.length === 0) return new Set();
	const rows = await db
		.select({ userId: notificationPrefs.userId })
		.from(notificationPrefs)
		.where(
			and(
				inArray(notificationPrefs.userId, userIds),
				eq(notificationPrefs.pref, "getting_started"),
				eq(notificationPrefs.enabled, false),
			),
		);
	return new Set(rows.map((r) => r.userId));
}

/** Owners and admins of a workspace — the people who can act on these emails. */
async function workspaceAdmins(organizationId: string) {
	const rows = await db
		.select({
			id: user.id,
			name: user.name,
			email: user.email,
			role: member.role,
		})
		.from(member)
		.innerJoin(user, eq(user.id, member.userId))
		.where(eq(member.organizationId, organizationId));
	return rows.filter((r) => isAdminRole(r.role));
}

/** Right after sign-up. Never throws: a failed welcome email must not break sign-in. */
export async function sendWelcomeEmail(newUser: {
	id: string;
	name: string;
	email: string;
}): Promise<void> {
	try {
		await sendOnce(
			`welcome:${newUser.id}`,
			newUser.email,
			welcomeEmail({ name: newUser.name, appUrl: getAppUrl() }),
		);
	} catch (err) {
		console.error("Welcome email failed", err);
	}
}

/**
 * After /api/ingest records a pull request: on the workspace's very first
 * audit, tells its owners and admins what happened and how to make the
 * check required. Never throws, so it can't fail the report.
 */
export async function sendFirstAuditEmailIfFirst(opts: {
	organizationId: string;
	repoFullName: string;
	prNumber: number;
	pullId: string;
	status: PrStatus;
}): Promise<void> {
	try {
		const [{ count }] = await db
			.select({ count: sql<number>`count(*)::int` })
			.from(pullRequests)
			.innerJoin(repos, eq(repos.id, pullRequests.repoId))
			.where(eq(repos.organizationId, opts.organizationId));
		if (count !== 1) return;

		const pullUrl = `${getAppUrl()}/pulls/${opts.pullId}`;
		for (const admin of await workspaceAdmins(opts.organizationId)) {
			await sendOnce(
				`first-audit:${opts.organizationId}:${admin.id}`,
				admin.email,
				firstAuditEmail({ ...opts, name: admin.name, pullUrl }),
			);
		}
	} catch (err) {
		console.error("First audit email failed", err);
	}
}

export interface LifecycleRunResult {
	email: string;
	kind: "connect-nudge" | "pr-nudge";
	sent: boolean;
	error?: string;
}

/**
 * The daily nudges, run by the daily cron:
 * - connect: users who signed up 1–7 days ago and still have no repository
 *   in any workspace they belong to;
 * - PR: workspaces whose first repository was connected 3–14 days ago and
 *   that have no audited pull request, emailed to their owners and admins.
 * The windows keep a late first run from emailing long-gone sign-ups.
 */
export async function runLifecycleNudges(): Promise<LifecycleRunResult[]> {
	const now = Date.now();
	const appUrl = getAppUrl();
	const results: LifecycleRunResult[] = [];

	const stalledUsers = await db
		.select({ id: user.id, name: user.name, email: user.email })
		.from(user)
		.where(
			and(
				lte(user.createdAt, new Date(now - DAY_MS)),
				gte(user.createdAt, new Date(now - 7 * DAY_MS)),
				sql`not exists (
					select 1 from ${member}
					inner join ${repos} on ${repos.organizationId} = ${member.organizationId}
					where ${member.userId} = ${user.id}
				)`,
			),
		);
	const connectOptOut = await tipsOptedOut(stalledUsers.map((u) => u.id));
	for (const u of stalledUsers) {
		if (connectOptOut.has(u.id)) continue;
		try {
			const sent = await sendOnce(
				`connect-nudge:${u.id}`,
				u.email,
				connectNudgeEmail({ name: u.name, appUrl }),
			);
			if (sent) results.push({ email: u.email, kind: "connect-nudge", sent });
		} catch (err) {
			results.push({
				email: u.email,
				kind: "connect-nudge",
				sent: false,
				error: err instanceof Error ? err.message : String(err),
			});
		}
	}

	// Each workspace's earliest repository, when it has no audited PR yet.
	const quietRepos = await db
		.select({
			organizationId: repos.organizationId,
			fullName: repos.fullName,
			createdAt: repos.createdAt,
		})
		.from(repos)
		.where(
			sql`not exists (
				select 1 from ${pullRequests}
				inner join ${repos} as r2 on r2.id = ${pullRequests.repoId}
				where r2.organization_id = ${repos.organizationId}
			)`,
		)
		.orderBy(asc(repos.createdAt));
	const firstRepoByOrg = new Map<string, (typeof quietRepos)[number]>();
	for (const r of quietRepos) {
		if (!firstRepoByOrg.has(r.organizationId)) {
			firstRepoByOrg.set(r.organizationId, r);
		}
	}

	for (const repo of firstRepoByOrg.values()) {
		const age = now - repo.createdAt.getTime();
		if (age < 3 * DAY_MS || age > 14 * DAY_MS) continue;
		const admins = await workspaceAdmins(repo.organizationId);
		const optOut = await tipsOptedOut(admins.map((a) => a.id));
		for (const admin of admins) {
			if (optOut.has(admin.id)) continue;
			try {
				const sent = await sendOnce(
					`pr-nudge:${repo.organizationId}:${admin.id}`,
					admin.email,
					prNudgeEmail({
						name: admin.name,
						repoFullName: repo.fullName,
						appUrl,
					}),
				);
				if (sent) results.push({ email: admin.email, kind: "pr-nudge", sent });
			} catch (err) {
				results.push({
					email: admin.email,
					kind: "pr-nudge",
					sent: false,
					error: err instanceof Error ? err.message : String(err),
				});
			}
		}
	}

	return results;
}
