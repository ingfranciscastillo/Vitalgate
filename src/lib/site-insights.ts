import {
	CRUX_THRESHOLDS,
	type CruxMetric,
	type CruxSnapshot,
	cruxRating,
} from "@/lib/crux";

/**
 * Plain-language findings for a site's Core Web Vitals page, written from
 * its own numbers so every page says something specific to that site.
 */

const NAMES: Record<"LCP" | "CLS" | "INP", string> = {
	LCP: "Largest Contentful Paint",
	CLS: "Cumulative Layout Shift",
	INP: "Interaction to Next Paint",
};

export function formatMetric(metric: CruxMetric, value: number): string {
	if (metric === "CLS") return value.toFixed(2);
	return value < 1000
		? `${Math.round(value)} ms`
		: `${(value / 1000).toFixed(1)} s`;
}

const ordinal = (n: number) => {
	const s = ["th", "st", "nd", "rd"];
	const v = n % 100;
	return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
};

export interface PeerPoint {
	name: string;
	lcp: number | null;
	inp: number | null;
}

export function siteInsights(opts: {
	name: string;
	category: string;
	snapshot: CruxSnapshot;
	peers: PeerPoint[];
}): string[] {
	const { name, snapshot, peers } = opts;
	const m = snapshot.metrics;
	const out: string[] = [];

	const vitals = (["LCP", "CLS", "INP"] as const).filter((k) => m[k] != null);
	const failing = vitals.filter(
		(k) => cruxRating(k, m[k] as number) !== "good",
	);
	if (failing.length === 0) {
		out.push(
			`${name} passes Core Web Vitals: ${vitals
				.map((k) => `${k} ${formatMetric(k, m[k] as number)}`)
				.join(", ")} are all in Google's "good" range for 3 in 4 visits.`,
		);
	} else {
		out.push(
			`${name} fails Core Web Vitals on ${failing
				.map(
					(k) =>
						`${NAMES[k]} (${formatMetric(k, m[k] as number)}, good is ${formatMetric(k, CRUX_THRESHOLDS[k].good)} or less)`,
				)
				.join(" and ")}.`,
		);
	}

	if (m.LCP != null && m.TTFB != null && m.LCP > CRUX_THRESHOLDS.LCP.good) {
		const share = Math.round((m.TTFB / m.LCP) * 100);
		out.push(
			share >= 40
				? `The server answers slowly: time to first byte is ${formatMetric("TTFB", m.TTFB)}, ${share}% of the LCP time, so a faster backend or cache would help most.`
				: `Time to first byte is ${formatMetric("TTFB", m.TTFB)}, so most of the LCP time is spent after the first byte: loading the main image, fonts or scripts.`,
		);
	}

	const lcpPeers = peers.filter((p) => p.lcp != null);
	if (m.LCP != null && lcpPeers.length >= 4) {
		const rank =
			lcpPeers.filter((p) => (p.lcp as number) < (m.LCP as number)).length + 1;
		out.push(
			`Among ${lcpPeers.length + 1} ${opts.category.toLowerCase()} sites we track, ${name} has the ${ordinal(rank)} fastest LCP.`,
		);
	}

	const inp = snapshot.history.filter((p) => p.INP != null);
	if (inp.length >= 8) {
		const first = inp[0].INP as number;
		const last = inp[inp.length - 1].INP as number;
		const diff = Math.round(last - first);
		if (Math.abs(diff) >= 15) {
			out.push(
				`INP has ${diff < 0 ? "improved" : "worsened"} by ${Math.abs(diff)} ms over the last ${inp.length} weeks, from ${formatMetric("INP", first)} to ${formatMetric("INP", last)}.`,
			);
		} else {
			out.push(
				`INP has held steady around ${formatMetric("INP", last)} over the last ${inp.length} weeks.`,
			);
		}
	}

	return out;
}
