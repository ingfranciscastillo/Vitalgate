import {
	formatMetric,
	type MetricKey,
	metricDelta,
	type PrStatus,
	type Severity,
} from "@/lib/mock-data";

/**
 * Hidden marker the workflow looks for to update its previous comment on a
 * PR instead of adding a new one on every push.
 */
export const PR_COMMENT_MARKER = "<!-- vitalgate-report -->";

const METRIC_ORDER: MetricKey[] = ["PERF", "LCP", "CLS", "FCP", "TBT", "INP"];

const METRIC_LABEL: Record<MetricKey, string> = {
	PERF: "Performance score",
	LCP: "Largest Contentful Paint",
	CLS: "Cumulative Layout Shift",
	FCP: "First Contentful Paint",
	TBT: "Total Blocking Time",
	INP: "Interaction to Next Paint",
};

export interface PrCommentInput {
	status: PrStatus;
	metrics: Partial<Record<MetricKey, number>>;
	/** The run this PR is compared against (the repo's previous run when the PR was first audited). */
	baseline: Partial<Record<MetricKey, number>>;
	budgets: { metric: MetricKey; max: number; severity: Severity }[];
	/** The pull request's page in Vitalgate. */
	reportUrl: string;
	/** True when this run is the PR's own baseline (the repo's first audit), so there's nothing to diff. */
	isFirstRun: boolean;
	/** Lighthouse runs the metrics are the median of. */
	runs: number;
}

const HEADLINE: Record<PrStatus, string> = {
	failing: "❌ **Vitalgate:** a required performance budget was exceeded",
	warning: "⚠️ **Vitalgate:** a soft performance budget was exceeded",
	passing: "✅ **Vitalgate:** all performance budgets passed",
};

function violates(metric: MetricKey, value: number, max: number) {
	return metric === "PERF" ? value < max : value > max;
}

function formatBudget(metric: MetricKey, max: number, severity: Severity) {
	const bound = metric === "PERF" ? "≥" : "≤";
	return `${bound} ${formatMetric(metric, max)}${severity === "fail" ? " (required)" : ""}`;
}

function formatChange(
	metric: MetricKey,
	value: number,
	baseline: number | undefined,
	isFirstRun: boolean,
) {
	if (isFirstRun || baseline == null) return "—";
	const { diff, pct, better } = metricDelta(metric, value, baseline);
	if (diff === 0) return "no change";
	const sign = diff > 0 ? "+" : "";
	const text =
		metric === "PERF"
			? `${sign}${Math.round(diff)}`
			: `${sign}${Math.round(pct)}%`;
	return `${text} ${better ? "🟢" : "🔴"}`;
}

/**
 * The Markdown comment the workflow posts on the pull request. Only metric
 * names and numbers go in it — no PR title or author — so there's nothing
 * user-controlled to escape.
 */
export function renderPrComment(input: PrCommentInput): string {
	const budgetFor = new Map(input.budgets.map((b) => [b.metric, b]));

	const rows = METRIC_ORDER.flatMap((metric) => {
		const value = input.metrics[metric];
		if (value == null) return []; // not measured this run (e.g. INP in lab runs)
		const budget = budgetFor.get(metric);
		const result = !budget
			? ""
			: !violates(metric, value, budget.max)
				? "✅"
				: budget.severity === "fail"
					? "❌"
					: "⚠️";
		return [
			`| ${METRIC_LABEL[metric]} | ${formatMetric(metric, value)} | ${formatChange(metric, value, input.baseline[metric], input.isFirstRun)} | ${budget ? formatBudget(metric, budget.max, budget.severity) : "—"} | ${result} |`,
		];
	});

	return [
		PR_COMMENT_MARKER,
		HEADLINE[input.status],
		"",
		"| Metric | This PR | Change vs baseline | Budget | |",
		"| --- | --- | --- | --- | --- |",
		...rows,
		"",
		`<sub>${input.runs > 1 ? `Median of ${input.runs} Lighthouse lab runs` : "Lighthouse lab run"} on this workflow's runner. [Full report on Vitalgate](${input.reportUrl})${input.isFirstRun ? " · First audit for this repo, so there's no baseline to compare against yet." : ""}</sub>`,
	].join("\n");
}
