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
import type {
	AlertRuleKey,
	MetricKey,
	PrStatus,
	Severity,
} from "@/lib/mock-data";
import { renderPrComment } from "@/lib/pr-comment";
import { verifyOrgToken } from "@/lib/verify-org-token.server";

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

// Bounded to GitHub's own limits: these strings end up in alert emails and
// Slack/Discord posts, so a CI token holder can't push arbitrarily large ones.
const ingestBodySchema = z.object({
	githubRepoId: z.string().regex(/^\d{1,20}$/),
	prNumber: z.number().int().positive(),
	prTitle: z.string().min(1).max(256),
	prAuthor: z.string().min(1).max(39),
	branch: z.string().min(1).max(255),
	metrics: metricsSchema,
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

	const organizationId = await verifyOrgToken(token);
	if (!organizationId) return json({ error: "Invalid token" }, 401);

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
		.select({ id: repos.id, fullName: repos.fullName })
		.from(repos)
		.where(
			and(
				eq(repos.organizationId, organizationId),
				eq(repos.githubRepoId, body.githubRepoId),
			),
		)
		.limit(1);
	if (!repo) {
		return json(
			{ error: "Repo not connected to this organization on Vitalgate" },
			404,
		);
	}

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
			and(
				eq(pullRequests.repoId, repo.id),
				ne(pullRequests.number, body.prNumber),
			),
		)
		.orderBy(desc(pullRequests.openedAt))
		.limit(1);
	const baseline = lastRun?.metrics ?? body.metrics;

	const [pull] = await db
		.insert(pullRequests)
		.values({
			repoId: repo.id,
			number: body.prNumber,
			title: body.prTitle,
			author: body.prAuthor,
			branch: body.branch,
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
				title: body.prTitle,
				author: body.prAuthor,
				branch: body.branch,
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
				? `PR #${body.prNumber} exceeded the ${failed[0].metric} budget (${failed[0].value} vs max ${failed[0].max}).`
				: `PR #${body.prNumber} exceeded ${failed.length} required budgets: ${failed.map((v) => v.metric).join(", ")}.`;
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
				message: `PR #${body.prNumber}: ${regressed.join(", ")} worsened more than ${REGRESSION_THRESHOLD * 100}% vs this repo's 3-day average.`,
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
			prNumber: body.prNumber,
			prTitle: body.prTitle,
			prAuthor: body.prAuthor,
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

	// The workflow posts this on the pull request (see workflow-template.ts),
	// so its wording can improve without regenerating every repo's workflow.
	const comment = renderPrComment({
		status,
		metrics: body.metrics,
		baseline: pull.baseline,
		budgets: budgetRows,
		reportUrl: `${getAppUrl()}/pulls/${pull.id}`,
		isFirstRun: !lastRun,
	});

	return json({ status, violations, comment });
}

export const Route = createFileRoute("/api/ingest")({
	server: {
		handlers: {
			POST: ({ request }) => handleIngest(request),
		},
	},
});
