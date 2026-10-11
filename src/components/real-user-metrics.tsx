import { useQuery } from "@tanstack/react-query";
import {
	CRUX_TILES,
	CruxMetricsView,
	formatCruxDay,
} from "@/components/crux-metrics-view";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { realUserMetricsQueryOptions } from "@/lib/crux.queries";

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
					{CRUX_TILES.map((t) => (
						<Skeleton key={t.metric} className="h-20" />
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
						, {formatCruxDay(snapshot.period.firstDate)} –{" "}
						{formatCruxDay(snapshot.period.lastDate)}
					</>,
				)}
				<span className="text-[10px] text-muted-foreground">
					Chrome UX Report
				</span>
			</div>
			<CruxMetricsView snapshot={snapshot} />
		</Card>
	);
}
