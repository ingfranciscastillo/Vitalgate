import {
	ArrowDownRightIcon,
	ArrowLeftIcon,
	ArrowUpRightIcon,
	CheckCircleIcon,
	XCircleIcon,
} from "@phosphor-icons/react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { motion, useReducedMotion } from "motion/react";
import { AppShell } from "@/components/app-shell";
import { MetricCard } from "@/components/metric-card";
import { StatusBadge } from "@/components/status-badge";
import { Card } from "@/components/ui/card";
import { timeAgo } from "@/lib/format";
import {
	formatMetric,
	METRIC_META,
	type MetricKey,
	metricDelta,
} from "@/lib/mock-data";
import { staggerContainer, staggerItem } from "@/lib/motion";
import { pullDetailQueryOptions } from "@/lib/pulls.queries";

export const Route = createFileRoute("/_authenticated/pulls/$prId")({
	// loader must come before head — with both present on a route, head-before-loader
	// breaks TanStack Router's Route.useLoaderData() type inference (returns undefined).
	loader: async ({ context, params }) => {
		const pull = await context.queryClient.ensureQueryData(
			pullDetailQueryOptions(params.prId),
		);
		if (!pull) throw notFound();
		return pull;
	},
	head: ({ params }) => ({ meta: [{ title: `PR ${params.prId}: Vitalgate` }] }),
	notFoundComponent: () => (
		<AppShell title="PR not found">
			<p className="text-muted-foreground">No PR with that id.</p>
		</AppShell>
	),
	component: PrDetail,
});

function PrDetail() {
	const { prId } = Route.useParams();
	const { data: pull } = useSuspenseQuery(pullDetailQueryOptions(prId));
	// The loader already redirects to notFoundComponent when null; this just
	// narrows the type for TS since this query call is independent of it.
	if (!pull) throw notFound();

	const metrics = Object.keys(pull.metrics) as MetricKey[];
	const budgetMap = Object.fromEntries(
		pull.repo.budgets.map((b) => [b.metric, b]),
	) as Partial<Record<MetricKey, (typeof pull.repo.budgets)[number]>>;
	const reduce = useReducedMotion();

	return (
		<AppShell>
			<div className="mb-6">
				<Link
					to="/pulls"
					className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
				>
					<ArrowLeftIcon className="h-3.5 w-3.5" /> Back to pull requests
				</Link>
				<div className="mt-2 flex flex-wrap items-center gap-3">
					<span className="font-mono text-sm text-muted-foreground">
						{pull.repo.fullName} · #{pull.number}
					</span>
					<StatusBadge status={pull.status} />
				</div>
				<h1 className="mt-2 text-2xl font-semibold tracking-tight">
					{pull.title}
				</h1>
				<div className="mt-1 text-xs text-muted-foreground font-mono">
					{pull.branch} → {pull.repo.defaultBranch} · {pull.author} · opened{" "}
					{timeAgo(pull.openedAt)}
				</div>
			</div>

			<Card
				className={`p-5 mb-5 border ${pull.status === "failing" ? "border-destructive/40 bg-destructive/5" : pull.status === "warning" ? "border-warning/40 bg-warning/5" : "border-success/40 bg-success/5"}`}
			>
				<div className="flex items-start gap-3">
					{pull.status === "passing" ? (
						<CheckCircleIcon className="h-5 w-5 text-success mt-0.5" />
					) : (
						<XCircleIcon className="h-5 w-5 text-destructive mt-0.5" />
					)}
					<div>
						<div className="font-semibold">
							{pull.status === "passing"
								? "All budgets within range"
								: pull.status === "warning"
									? "Soft budgets crossed"
									: "Required budget violated, merge blocked"}
						</div>
						<div className="text-sm text-muted-foreground mt-0.5">
							{pull.status === "failing"
								? "This PR cannot be merged until the failing metric is within its budget or an admin overrides it."
								: "Review the deltas below before merging."}
						</div>
					</div>
				</div>
			</Card>

			<motion.div
				className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4"
				variants={staggerContainer}
				initial="hidden"
				animate="show"
			>
				{metrics.map((k) => {
					const value = pull.metrics[k];
					if (value == null) return null;
					return (
						<motion.div key={k} variants={staggerItem(reduce)}>
							<MetricCard
								metric={k}
								value={value}
								baseline={pull.baseline[k]}
								budget={budgetMap[k]?.max}
							/>
						</motion.div>
					);
				})}
			</motion.div>

			<Card className="mt-6 p-0 overflow-hidden">
				<div className="px-5 py-3 border-b border-border bg-muted/30 font-semibold text-sm">
					Detailed comparison
				</div>
				<div className="overflow-x-auto">
					<table className="w-full text-sm">
						<thead className="text-xs uppercase tracking-wider text-muted-foreground">
							<tr>
								<th className="text-left font-medium px-5 py-2.5">Metric</th>
								<th className="text-left font-medium px-5 py-2.5">
									Baseline (main)
								</th>
								<th className="text-left font-medium px-5 py-2.5">This PR</th>
								<th className="text-left font-medium px-5 py-2.5">Δ</th>
								<th className="text-left font-medium px-5 py-2.5">Budget</th>
								<th className="text-left font-medium px-5 py-2.5">Result</th>
							</tr>
						</thead>
						<motion.tbody
							className="divide-y divide-border"
							variants={staggerContainer}
							initial="hidden"
							animate="show"
						>
							{metrics.map((k) => {
								const value = pull.metrics[k];
								const baseline = pull.baseline[k];
								if (value == null) return null;
								const b = budgetMap[k];
								const violates = b
									? k === "PERF"
										? value < b.max
										: value > b.max
									: false;
								return (
									<motion.tr key={k} variants={staggerItem(reduce)}>
										<td className="px-5 py-3">
											<span className="font-mono font-medium">{k}</span>{" "}
											<span className="text-xs text-muted-foreground ml-2">
												{METRIC_META[k].label}
											</span>
										</td>
										<td className="px-5 py-3 font-mono">
											{baseline == null ? "-" : formatMetric(k, baseline)}
										</td>
										<td className="px-5 py-3 font-mono">
											{formatMetric(k, value)}
										</td>
										<td className="px-5 py-3 font-mono">
											{baseline == null
												? "-"
												: (() => {
														const d = metricDelta(k, value, baseline);
														return (
															<span
																className={`inline-flex items-center gap-1 ${d.better ? "text-success" : d.diff === 0 ? "text-muted-foreground" : "text-destructive"}`}
															>
																{d.better ? (
																	<ArrowDownRightIcon className="h-3 w-3" />
																) : d.diff === 0 ? null : (
																	<ArrowUpRightIcon className="h-3 w-3" />
																)}
																{d.pct >= 0 ? "+" : ""}
																{d.pct.toFixed(1)}%
															</span>
														);
													})()}
										</td>
										<td className="px-5 py-3 font-mono">
											{b ? formatMetric(k, b.max) : "-"}
										</td>
										<td className="px-5 py-3">
											{violates ? (
												<span className="text-destructive font-medium text-xs">
													{b?.severity === "fail" ? "BLOCKED" : "WARN"}
												</span>
											) : (
												<span className="text-success text-xs">OK</span>
											)}
										</td>
									</motion.tr>
								);
							})}
						</motion.tbody>
					</table>
				</div>
			</Card>

			<Card className="mt-6 p-5">
				<h2 className="font-semibold">Posted to GitHub</h2>
				<pre className="mt-4 p-4 rounded-md bg-muted/50 border border-border font-mono text-xs overflow-x-auto whitespace-pre-wrap">
					{`## 🟢 Vitalgate performance report

| Metric | Baseline | PR | Δ |
|---|---|---|---|
${metrics
	.filter((k) => pull.metrics[k] != null)
	.map((k) => {
		const value = pull.metrics[k] as number;
		const baseline = pull.baseline[k];
		const delta =
			baseline == null
				? "-"
				: `${metricDelta(k, value, baseline).pct.toFixed(1)}%`;
		return `| ${k} | ${baseline == null ? "-" : formatMetric(k, baseline)} | ${formatMetric(k, value)} | ${delta} |`;
	})
	.join("\n")}

${pull.status === "failing" ? "❌ Merge blocked: at least one required budget was violated." : pull.status === "warning" ? "⚠️  Soft budgets crossed, review before merging." : "✅ All budgets within range."}`}
				</pre>
			</Card>
		</AppShell>
	);
}
