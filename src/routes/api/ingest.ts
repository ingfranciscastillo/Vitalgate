import { createFileRoute } from "@tanstack/react-router";
import { and, desc, eq, gte, inArray, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
	alerts,
	budgets,
	type NewAlert,
	pullRequests,
	repos,
} from "@/db/schema";
import { deliverAlerts } from "@/lib/alert-delivery.server";
import { getOrgAlertRules } from "@/lib/alert-rules.server";
import { getAppUrl } from "@/lib/app-url.server";
import { createCheckRun } from "@/lib/github-check-run.server";
import {
	pullNumberFromRef,
	verifyGithubOidcToken,
} from "@/lib/github-oidc.server";
import { upsertPrCommentAsApp } from "@/lib/github-pr-comment.server";
import {
	findOpenPullForCommit,
	type PullForCommit,
} from "@/lib/github-pull-for-commit.server";
import { fileIssuesForFailingPull } from "@/lib/issue-trackers.server";
import { sendFirstAuditEmailIfFirst } from "@/lib/lifecycle.server";
import type {
	AlertRuleKey,
	MetricKey,
	PrStatus,
	Severity,
} from "@/lib/mock-data";
import { renderPrComment } from "@/lib/pr-comment";

const metricsSchema = z
	.object({
		LCP: z.number().optional(),
		INP: z.number().optional(),
		CLS: z.number().optional(),
		FCP: z.number().optional(),
		TBT: z.number().optional(),
		PERF: z.number().optional(),
	})
	.strict();

// Which repo and PR a run is for come from its GitHub-signed OIDC token, not
// from here. These strings are bounded to GitHub's own limits: they end up
// in alert emails and Slack/Discord posts.
// Title, author, branch and head commit come from the workflow for
// pull_request runs; preview-deployment runs leave them out and they're read
// from GitHub instead.
const ingestBodySchema = z.object({
	prTitle: z.string().min(1).max(256).optional(),
	prAuthor: z.string().min(1).max(39).optional(),
	branch: z.string().min(1).max(255).optional(),
	metrics: metricsSchema,
	/** How many Lighthouse runs the metrics are the median of. */
	runs: z.number().int().min(1).max(10).optional(),
	/** The pull request's head commit, which the "Vitalgate" check is attached to. */
	headSha: z
		.string()
		.regex(/^[0-9a-f]{40}$/)
		.optional(),
});

const ALL_METRICS: MetricKey[] = ["LCP", "INP", "CLS", "FCP", "TBT", "PERF"];

function json(body: unknown, status = 200) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "content-type": "application/json" },
	});
}

function violatesBudget(metric: MetricKey, value: number, max: number) {
	return metric === "PERF" ? value < max : value > max;
}

// A run counts as "worse" than the recent trend once it's off by more than
// this fraction — small day-to-day noise shouldn't alert on its own.
const REGRESSION_THRESHOLD = 0.15;

function isRegression(metric: MetricKey, current: number, trailingAvg: number) {
	return metric === "PERF"
		? current < trailingAvg * (1 - REGRESSION_THRESHOLD)
		: current > trailingAvg * (1 + REGRESSION_THRESHOLD);
}

/** Average of each metric across the repo's runs from the last 3 days — the trend to compare this run against. */
async function getTrailingAverages(
	repoId: string,
): Promise<Partial<Record<MetricKey, number>>> {
	const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
	const [row] = await db
		.select({
			LCP: sql<string | null>`avg((${pullRequests.metrics}->>'LCP')::numeric)`,
			INP: sql<string | null>`avg((${pullRequests.metrics}->>'INP')::numeric)`,
			CLS: sql<string | null>`avg((${pullRequests.metrics}->>'CLS')::numeric)`,
			FCP: sql<string | null>`avg((${pullRequests.metrics}->>'FCP')::numeric)`,
			TBT: sql<string | null>`avg((${pullRequests.metrics}->>'TBT')::numeric)`,
			PERF: sql<
				string | null
			>`avg((${pullRequests.metrics}->>'PERF')::numeric)`,
		})
		.from(pullRequests)
		.where(
			and(
				eq(pullRequests.repoId, repoId),
				gte(pullRequests.openedAt, threeDaysAgo),
			),
		);

	const out: Partial<Record<MetricKey, number>> = {};
	if (!row) return out;
	for (const metric of ALL_METRICS) {
		const value = row[metric];
		if (value != null) out[metric] = Number(value);
	}
	return out;
}

/** Median PERF score across the org's repos, one value per repo (its latest run). */
async function getOrgMedianPerf(
	organizationId: string,
): Promise<number | null> {
	const rows = await db
		.selectDistinctOn([pullRequests.repoId], {
			repoId: pullRequests.repoId,
			perf: sql<string | null>`(${pullRequests.metrics}->>'PERF')`,
		})
		.from(pullRequests)
		.innerJoin(repos, eq(pullRequests.repoId, repos.id))
		.where(eq(repos.organizationId, organizationId))
		.orderBy(pullRequests.repoId, desc(pullRequests.openedAt));

	const values = rows
		.map((r) => (r.perf != null ? Number(r.perf) : null))
		.filter((v): v is number => v != null)
		.sort((a, b) => a - b);
	if (values.length === 0) return null;
	const mid = Math.floor(values.length / 2);
	return values.length % 2 !== 0
		? values[mid]
		: (values[mid - 1] + values[mid]) / 2;
}

async function handleIngest(request: Request) {
	const authHeader = request.headers.get("authorization") ?? "";
	const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
	if (!token) return json({ error: "Missing bearer token" }, 401);

	// The workflow authenticates with an OIDC token GitHub issued for this
	// run, meant for this Vitalgate (audience = our origin). It names the
	// repository, and the pull request (or deployed commit); nothing else in
	// the request is trusted for that.
	const claims = await verifyGithubOidcToken(token, getAppUrl());
	if (!claims) return json({ error: "Invalid token" }, 401);
	if (
		claims.event_name !== "pull_request" &&
		claims.event_name !== "deployment_status"
	) {
		return json(
			{ error: "Only pull_request and deployment_status runs can report" },
			400,
		);
	}

	let bodyJson: unknown;
	try {
		bodyJson = await request.json();
	} catch {
		return json({ error: "Body must be JSON" }, 400);
	}

	const parsed = ingestBodySchema.safeParse(bodyJson);
	if (!parsed.success) {
		return json({ error: "Invalid payload", issues: parsed.error.issues }, 400);
	}
	const body = parsed.data;

	const [repo] = await db
		.select({
			id: repos.id,
			organizationId: repos.organizationId,
			fullName: repos.fullName,
			postPrComments: repos.postPrComments,
			installationId: repos.installationId,
		})
		.from(repos)
		.where(eq(repos.githubRepoId, claims.repository_id))
		.limit(1);
	if (!repo) {
		return json(
			{ error: `${claims.repository} isn't connected to Vitalgate` },
			404,
		);
	}
	const { organizationId } = repo;

	// Which pull request this run is for.
	let pr: PullForCommit;
	if (claims.event_name === "pull_request") {
		const number = pullNumberFromRef(claims.ref);
		if (!number || !body.prTitle || !body.prAuthor || !body.branch) {
			return json({ error: "Missing pull request details" }, 400);
		}
		pr = {
			number,
			title: body.prTitle,
			author: body.prAuthor,
			branch: body.branch,
			headSha: body.headSha ?? claims.sha,
		};
	} else {
		// A preview deployment only knows the deployed commit: find the open
		// PR it's the head of, through the GitHub App.
		const found = await findOpenPullForCommit({
			installationId: repo.installationId,
			repoFullName: repo.fullName,
			sha: claims.sha,
		});
		if (!found) {
			return json({
				status: "skipped",
				reason:
					"This deployment's commit isn't the head of an open pull request.",
			});
		}
		pr = found;
	}
	const prNumber = pr.number;

	const budgetRows = await db
		.select({
			metric: budgets.metric,
			max: budgets.max,
			severity: budgets.severity,
		})
		.from(budgets)
		.where(eq(budgets.repoId, repo.id));

	let status: PrStatus = "passing";
	const violations: {
		metric: MetricKey;
		value: number;
		max: number;
		severity: Severity;
	}[] = [];
	for (const b of budgetRows) {
		const value = body.metrics[b.metric];
		if (value == null) continue; // Lighthouse didn't report this metric this run
		if (violatesBudget(b.metric, value, b.max)) {
			violations.push({
				metric: b.metric,
				value,
				max: b.max,
				severity: b.severity,
			});
			if (b.severity === "fail") status = "failing";
			else if (status === "passing") status = "warning";
		}
	}

	// This gates only whether an entry lands in the /alerts feed. Whether the
	// PR itself gets blocked is a separate, unrelated decision already made
	// above from each budget's own severity/action — disabling this rule
	// doesn't loosen any budget.
	const ruleStates = await getOrgAlertRules(organizationId);
	const isRuleEnabled = (key: AlertRuleKey) =>
		ruleStates.find((r) => r.key === key)?.enabled ?? false;

	// Both read "before" state — the trailing average excludes this run since
	// it hasn't been written yet, and the org median (if score_below_80 is on)
	// needs a pre-update snapshot to tell whether this run is what tipped it
	// under 80, not just confirm it was already there.
	const trailingAverages = isRuleEnabled("regression_3day")
		? await getTrailingAverages(repo.id)
		: {};
	const medianPerfBefore = isRuleEnabled("score_below_80")
		? await getOrgMedianPerf(organizationId)
		: null;

	// Baseline for a brand-new PR row: the repo's most recent run of another
	// PR, or itself if this is the first run ever recorded (nothing to
	// regress from).
	const [lastRun] = await db
		.select({ metrics: pullRequests.metrics })
		.from(pullRequests)
		.where(
			and(eq(pullRequests.repoId, repo.id), ne(pullRequests.number, prNumber)),
		)
		.orderBy(desc(pullRequests.openedAt))
		.limit(1);
	const baseline = lastRun?.metrics ?? body.metrics;

	const [pull] = await db
		.insert(pullRequests)
		.values({
			repoId: repo.id,
			number: prNumber,
			title: pr.title,
			author: pr.author,
			branch: pr.branch,
			status,
			openedAt: new Date(),
			metrics: body.metrics,
			baseline,
		})
		.onConflictDoUpdate({
			target: [pullRequests.repoId, pullRequests.number],
			// baseline/openedAt intentionally not touched — a re-run (new commit
			// pushed to the same PR) keeps comparing against the original baseline.
			set: {
				title: pr.title,
				author: pr.author,
				branch: pr.branch,
				status,
				metrics: body.metrics,
			},
		})
		.returning({ id: pullRequests.id, baseline: pullRequests.baseline });

	const newAlerts: NewAlert[] = [];

	// A required (severity "fail") budget was violated — the case the
	// "Budget violation" rule describes. "warning"-only runs don't alert:
	// those are soft budgets, not blockers.
	if (isRuleEnabled("budget_violation") && status === "failing") {
		const failed = violations.filter((v) => v.severity === "fail");
		const message =
			failed.length === 1
				? `PR #${prNumber} exceeded the ${failed[0].metric} budget (${failed[0].value} vs max ${failed[0].max}).`
				: `PR #${prNumber} exceeded ${failed.length} required budgets: ${failed.map((v) => v.metric).join(", ")}.`;
		newAlerts.push({
			repoId: repo.id,
			level: "critical",
			title: "Budget violation",
			message,
		});
	}

	if (isRuleEnabled("regression_3day")) {
		const regressed = ALL_METRICS.filter((metric) => {
			const current = body.metrics[metric];
			const avg = trailingAverages[metric];
			return (
				current != null && avg != null && isRegression(metric, current, avg)
			);
		});
		if (regressed.length > 0) {
			newAlerts.push({
				repoId: repo.id,
				level: "warning",
				title: "3-day regression",
				message: `PR #${prNumber}: ${regressed.join(", ")} worsened more than ${REGRESSION_THRESHOLD * 100}% vs this repo's 3-day average.`,
			});
		}
	}

	if (isRuleEnabled("score_below_80")) {
		const medianPerfAfter = await getOrgMedianPerf(organizationId);
		if (
			medianPerfBefore != null &&
			medianPerfBefore >= 80 &&
			medianPerfAfter != null &&
			medianPerfAfter < 80
		) {
			newAlerts.push({
				repoId: repo.id,
				level: "critical",
				title: "Score below 80",
				message: `Workspace median performance score fell to ${Math.round(medianPerfAfter)} (was ${Math.round(medianPerfBefore)}).`,
			});
		}
	}

	if (newAlerts.length > 0) {
		const inserted = await db
			.insert(alerts)
			.values(newAlerts)
			.returning({ id: alerts.id });

		// Awaited rather than fire-and-forget: on serverless the function can
		// be frozen as soon as the response is sent. Bounded by per-webhook
		// timeouts, and deliverAlerts never throws.
		const deliveredTo = await deliverAlerts(newAlerts, {
			organizationId,
			repoFullName: repo.fullName,
			prNumber: prNumber,
			prTitle: pr.title,
			prAuthor: pr.author,
			pullId: pull.id,
		});
		if (deliveredTo.length > 0) {
			await db
				.update(alerts)
				.set({ deliveredTo })
				.where(
					inArray(
						alerts.id,
						inserted.map((a) => a.id),
					),
				);
		}
	}

	// One results table, rendered here so its wording can improve without
	// regenerating every repo's workflow: the check's summary, and the PR
	// comment when the repo has comments on.
	const reportUrl = `${getAppUrl()}/pulls/${pull.id}`;
	const results = renderPrComment({
		status,
		metrics: body.metrics,
		baseline: pull.baseline,
		budgets: budgetRows,
		reportUrl,
		isFirstRun: !lastRun,
		runs: body.runs ?? 1,
	});
	const comment = repo.postPrComments ? results : null;

	// The "Vitalgate" check carries pass/fail. When it's in place the
	// workflow job doesn't fail on budgets (see workflow-template.ts), so a
	// red job only ever means the audit itself broke.
	const checkRun = await createCheckRun({
		installationId: repo.installationId,
		repoFullName: repo.fullName,
		headSha: pr.headSha,
		status,
		summary: results,
		detailsUrl: reportUrl,
	});

	// With the GitHub App, Vitalgate posts the comment itself (as the app,
	// and on fork PRs too) and the workflow gets nothing to post. Without it,
	// or if that fails, the workflow posts it with its own token.
	const postedByApp =
		comment !== null &&
		(await upsertPrCommentAsApp({
			installationId: repo.installationId,
			repoFullName: repo.fullName,
			prNumber: prNumber,
			body: comment,
		}));

	// A PR that breaks a required budget gets one issue in the workspace's
	// tracker (Linear), if one is connected. Best-effort, like alerts.
	if (status === "failing") {
		await fileIssuesForFailingPull({
			organizationId,
			pullId: pull.id,
			repoFullName: repo.fullName,
			prNumber,
			prTitle: pr.title,
			resultsMarkdown: results,
			pullUrl: reportUrl,
		});
	}

	// Only does anything on the workspace's very first audit (sent once).
	await sendFirstAuditEmailIfFirst({
		organizationId,
		repoFullName: repo.fullName,
		prNumber,
		pullId: pull.id,
		status,
	});

	return json({
		status,
		violations,
		comment: postedByApp ? null : comment,
		checkRun,
		// Lets the workflow's fallback comment find the PR on preview runs.
		prNumber,
	});
}

export const Route = createFileRoute("/api/ingest")({
	server: {
		handlers: {
			POST: ({ request }) => handleIngest(request),
		},
	},
});
