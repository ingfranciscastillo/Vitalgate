/**
 * Real-user metrics from the Chrome UX Report (CrUX): the 75th percentile of
 * what Chrome users actually experienced on a site over the last 28 days.
 * Unlike Lighthouse's lab runs, this includes INP. Shared by the server
 * (parsing Google's responses) and the repo page (ratings).
 */

export type CruxMetric = "INP" | "LCP" | "CLS" | "FCP" | "TTFB";

/** Our metric keys → CrUX API metric names. */
export const CRUX_METRIC_NAMES: Record<CruxMetric, string> = {
	INP: "interaction_to_next_paint",
	LCP: "largest_contentful_paint",
	CLS: "cumulative_layout_shift",
	FCP: "first_contentful_paint",
	TTFB: "experimental_time_to_first_byte",
};

/**
 * Core Web Vitals thresholds at p75: at or below `good` is good, at or below
 * `poor` needs improvement, above it is poor. Milliseconds, except CLS.
 */
export const CRUX_THRESHOLDS: Record<
	CruxMetric,
	{ good: number; poor: number }
> = {
	INP: { good: 200, poor: 500 },
	LCP: { good: 2500, poor: 4000 },
	CLS: { good: 0.1, poor: 0.25 },
	FCP: { good: 1800, poor: 3000 },
	TTFB: { good: 800, poor: 1800 },
};

export type CruxRating = "good" | "needs-improvement" | "poor";

export function cruxRating(metric: CruxMetric, p75: number): CruxRating {
	const t = CRUX_THRESHOLDS[metric];
	if (p75 <= t.good) return "good";
	if (p75 <= t.poor) return "needs-improvement";
	return "poor";
}

export interface CruxHistoryPoint {
	/** Last day of the 28-day collection window, YYYY-MM-DD. */
	date: string;
	INP: number | null;
	LCP: number | null;
	CLS: number | null;
}

export interface CruxSnapshot {
	/** p75 per metric; a metric CrUX has too little data for is left out. */
	metrics: Partial<Record<CruxMetric, number>>;
	/** The 28-day window the p75s cover, YYYY-MM-DD. */
	period: { firstDate: string; lastDate: string };
	/** Weekly p75s, oldest first — empty if the history query failed. */
	history: CruxHistoryPoint[];
}

interface CruxDate {
	year: number;
	month: number;
	day: number;
}

function isoDate(d: CruxDate): string {
	return `${d.year}-${String(d.month).padStart(2, "0")}-${String(d.day).padStart(2, "0")}`;
}

/** CrUX sends CLS percentiles as strings ("0.05") and the rest as numbers. */
function toNumber(value: unknown): number | null {
	if (typeof value === "number") return Number.isFinite(value) ? value : null;
	if (typeof value === "string" && value.trim() !== "") {
		const n = Number(value);
		return Number.isFinite(n) ? n : null;
	}
	return null;
}

const METRICS = Object.keys(CRUX_METRIC_NAMES) as CruxMetric[];

/** Parses a `records:queryRecord` response; null if it has no usable data. */
export function parseCruxRecord(
	body: unknown,
): Omit<CruxSnapshot, "history"> | null {
	const record = (body as { record?: unknown })?.record as
		| {
				metrics?: Record<string, { percentiles?: { p75?: unknown } }>;
				collectionPeriod?: { firstDate: CruxDate; lastDate: CruxDate };
		  }
		| undefined;
	if (!record?.metrics || !record.collectionPeriod) return null;

	const metrics: Partial<Record<CruxMetric, number>> = {};
	for (const metric of METRICS) {
		const p75 = toNumber(
			record.metrics[CRUX_METRIC_NAMES[metric]]?.percentiles?.p75,
		);
		if (p75 != null) metrics[metric] = p75;
	}
	if (Object.keys(metrics).length === 0) return null;

	return {
		metrics,
		period: {
			firstDate: isoDate(record.collectionPeriod.firstDate),
			lastDate: isoDate(record.collectionPeriod.lastDate),
		},
	};
}

/** Parses a `records:queryHistoryRecord` response into weekly points. */
export function parseCruxHistory(body: unknown): CruxHistoryPoint[] {
	const record = (body as { record?: unknown })?.record as
		| {
				metrics?: Record<
					string,
					{ percentilesTimeseries?: { p75s?: unknown[] } }
				>;
				collectionPeriods?: { lastDate: CruxDate }[];
		  }
		| undefined;
	if (!record?.metrics || !Array.isArray(record.collectionPeriods)) return [];

	const series = (metric: CruxMetric) =>
		record.metrics?.[CRUX_METRIC_NAMES[metric]]?.percentilesTimeseries?.p75s ??
		[];
	const inp = series("INP");
	const lcp = series("LCP");
	const cls = series("CLS");

	const points = record.collectionPeriods.map((period, i) => ({
		date: isoDate(period.lastDate),
		INP: toNumber(inp[i]),
		LCP: toNumber(lcp[i]),
		CLS: toNumber(cls[i]),
	}));
	// Weeks before the site had enough traffic come back all-null.
	return points.filter((p) => p.INP != null || p.LCP != null || p.CLS != null);
}

/** "https://shop.example.com/any/path" → "https://shop.example.com"; null unless https. */
export function toOrigin(url: string): string | null {
	try {
		const parsed = new URL(url.trim());
		return parsed.protocol === "https:" ? parsed.origin : null;
	} catch {
		return null;
	}
}
