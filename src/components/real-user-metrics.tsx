import { useQuery } from "@tanstack/react-query";
import {
	Line,
	LineChart,
	ReferenceLine,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";
import { Card } from "@/components/ui/card";
import {
	CRUX_THRESHOLDS,
	type CruxMetric,
	type CruxRating,
	cruxRating,
} from "@/lib/crux";
import { realUserMetricsQueryOptions } from "@/lib/crux.queries";

const TILES: { metric: CruxMetric; label: string }[] = [
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

function formatValue(metric: CruxMetric, value: number): string {
	if (metric === "CLS") return value.toFixed(2);
	return value < 1000
		? `${Math.round(value)} ms`
		: `${(value / 1000).toFixed(1)} s`;
}

function formatDay(iso: string): string {
	return new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, {
		month: "short",
		day: "numeric",
		timeZone: "UTC",
	});
}

/**
 * How real Chrome users experience the repo's live site, from the Chrome UX
 * Report: p75 per metric over the last 28 days, and the weekly INP trend.
 * Loads on its own so a slow Google response never holds up the page.
 */
export function RealUserMetrics({
	repoId,
	isAdmin,
	onEditUrl,
}: {
	repoId: string;
	isAdmin: boolean;
	/** Opens the Settings tab, where the production URL is set. */
	onEditUrl: () => void;
}) {
	const { data, isPending } = useQuery(realUserMetricsQueryOptions(repoId));

	const header = (subtitle: React.ReactNode) => (
		<div>
			<h2 className="font-semibold">Real users</h2>
			<p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
		</div>
	);

	if (isPending) {
		return (
			<Card className="p-5">
				{header("Loading the Chrome UX Report…")}
				<div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
					{TILES.map((t) => (
						<div
							key={t.metric}
							className="h-20 animate-pulse rounded-md bg-muted"
						/>
					))}
				</div>
			</Card>
		);
	}
	if (!data) return null;

	if (data.status !== "ok") {
		const editLink = (text: string) =>
			isAdmin ? (
				<button
					type="button"
					onClick={onEditUrl}
					className="font-medium text-primary hover:underline"
				>
					{text}
				</button>
			) : (
				<span>an admin can set it in Settings</span>
			);
		const message = {
			"not-configured": (
				<>
					Real-user metrics are off on this Vitalgate server: set{" "}
					<code className="font-mono">CRUX_API_KEY</code> to turn them on.
				</>
			),
			"no-url": (
				<>
					See INP, LCP and CLS as real Chrome users experience your live site.
					Add its URL to start — {editLink("set production URL")}.
				</>
			),
			"no-data": (
				<>
					The Chrome UX Report doesn't have enough real-user data for{" "}
					<span className="font-mono">
						{"origin" in data ? data.origin : ""}
					</span>{" "}
					yet. It only covers public sites with steady Chrome traffic. Wrong
					URL? {editLink("Change it")}.
				</>
			),
			error: (
				<>
					Couldn't reach the Chrome UX Report. Real-user metrics will be back on
					the next visit.
				</>
			),
		}[data.status];
		return (
			<Card className="p-5">
				{header("From the Chrome UX Report")}
				<p className="mt-3 text-sm text-muted-foreground">{message}</p>
			</Card>
		);
	}

	const { snapshot, origin } = data;
	const inpHistory = snapshot.history.filter((p) => p.INP != null);

	return (
		<Card className="p-5">
			<div className="flex flex-wrap items-start justify-between gap-2">
				{header(
					<>
						75th percentile of Chrome users on{" "}
						<a
							href={origin}
							target="_blank"
							rel="noreferrer"
							className="font-mono hover:text-foreground"
						>
							{origin.replace(/^https:\/\//, "")}
						</a>
						, {formatDay(snapshot.period.firstDate)} –{" "}
						{formatDay(snapshot.period.lastDate)}
					</>,
				)}
				<span className="text-[10px] text-muted-foreground">
					Chrome UX Report
				</span>
			</div>
			<div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
				{TILES.map(({ metric, label }) => {
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
								{value == null ? "—" : formatValue(metric, value)}
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
									tickFormatter={formatDay}
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
									labelFormatter={(d) => `Week to ${formatDay(String(d))}`}
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
		</Card>
	);
}
