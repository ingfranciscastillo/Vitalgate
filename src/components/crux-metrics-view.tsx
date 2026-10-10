import {
	Line,
	LineChart,
	ReferenceLine,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";
import {
	CRUX_THRESHOLDS,
	type CruxMetric,
	type CruxRating,
	type CruxSnapshot,
	cruxRating,
} from "@/lib/crux";

export const CRUX_TILES: { metric: CruxMetric; label: string }[] = [
	{ metric: "INP", label: "Interaction to Next Paint" },
	{ metric: "LCP", label: "Largest Contentful Paint" },
	{ metric: "CLS", label: "Cumulative Layout Shift" },
	{ metric: "FCP", label: "First Contentful Paint" },
	{ metric: "TTFB", label: "Time to First Byte" },
];

const RATING_STYLE: Record<CruxRating, { text: string; label: string }> = {
	good: { text: "text-success", label: "Good" },
	"needs-improvement": {
		text: "text-warning-foreground",
		label: "Needs improvement",
	},
	poor: { text: "text-destructive", label: "Poor" },
};

export function formatCruxValue(metric: CruxMetric, value: number): string {
	if (metric === "CLS") return value.toFixed(2);
	return value < 1000
		? `${Math.round(value)} ms`
		: `${(value / 1000).toFixed(1)} s`;
}

export function formatCruxDay(iso: string): string {
	return new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, {
		month: "short",
		day: "numeric",
		timeZone: "UTC",
	});
}

/** p75 tiles per metric, rated, plus the weekly INP trend — shared by the repo page and the public checker. */
export function CruxMetricsView({ snapshot }: { snapshot: CruxSnapshot }) {
	const inpHistory = snapshot.history.filter((p) => p.INP != null);
	return (
		<>
			<div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
				{CRUX_TILES.map(({ metric, label }) => {
					const value = snapshot.metrics[metric];
					const rating = value == null ? null : cruxRating(metric, value);
					return (
						<div
							key={metric}
							className="rounded-md border border-border p-3"
							title={label}
						>
							<div className="text-xs font-medium text-muted-foreground">
								{metric}
							</div>
							<div
								className={`mt-1 font-mono text-xl font-semibold ${rating ? RATING_STYLE[rating].text : "text-muted-foreground"}`}
							>
								{value == null ? "—" : formatCruxValue(metric, value)}
							</div>
							<div className="mt-0.5 text-[11px] text-muted-foreground">
								{rating ? RATING_STYLE[rating].label : "Not enough data"}
							</div>
						</div>
					);
				})}
			</div>
			{inpHistory.length > 1 && (
				<div className="mt-5">
					<h3 className="text-sm font-medium">INP over time</h3>
					<p className="text-xs text-muted-foreground">
						Weekly p75. The dashed line is the 200 ms "good" threshold.
					</p>
					<div className="mt-3 h-40">
						<ResponsiveContainer>
							<LineChart
								data={inpHistory}
								margin={{ left: -10, right: 8, top: 8 }}
							>
								<XAxis
									dataKey="date"
									tickFormatter={formatCruxDay}
									tick={{ fontSize: 10 }}
									stroke="var(--color-muted-foreground)"
									minTickGap={24}
								/>
								<YAxis
									tick={{ fontSize: 10 }}
									stroke="var(--color-muted-foreground)"
									unit=" ms"
									width={64}
								/>
								<Tooltip
									labelFormatter={(d) => `Week to ${formatCruxDay(String(d))}`}
									formatter={(v) => [`${Math.round(Number(v))} ms`, "INP p75"]}
									contentStyle={{
										background: "var(--color-card)",
										border: "1px solid var(--color-border)",
										fontSize: 12,
									}}
								/>
								<ReferenceLine
									y={CRUX_THRESHOLDS.INP.good}
									stroke="var(--color-success)"
									strokeDasharray="4 4"
								/>
								<Line
									dataKey="INP"
									stroke="var(--color-chart-4)"
									strokeWidth={2}
									dot={false}
								/>
							</LineChart>
						</ResponsiveContainer>
					</div>
				</div>
			)}
		</>
	);
}
