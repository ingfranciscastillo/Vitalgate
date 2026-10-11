import { describe, expect, it } from "vitest";
import { siteInsights } from "@/lib/site-insights";

const period = { firstDate: "2026-09-11", lastDate: "2026-10-08" };
const history = Array.from({ length: 10 }, (_, i) => ({
	date: `2026-08-${10 + i}`,
	INP: 260 - i * 8,
	LCP: null,
	CLS: null,
}));

describe("site insights", () => {
	it("explains a failing site from its own numbers", () => {
		const lines = siteInsights({
			name: "Acme",
			category: "Design",
			snapshot: {
				metrics: { LCP: 4200, CLS: 0.03, INP: 150, TTFB: 2100 },
				period,
				history,
			},
			peers: [
				{ name: "A", lcp: 1800, inp: 90 },
				{ name: "B", lcp: 2600, inp: 120 },
				{ name: "C", lcp: 5000, inp: 200 },
				{ name: "D", lcp: 3000, inp: 140 },
			],
		});
		expect(lines[0]).toBe(
			"Acme fails Core Web Vitals on Largest Contentful Paint (4.2 s, good is 2.5 s or less).",
		);
		expect(lines[1]).toContain("server answers slowly");
		expect(lines[2]).toBe(
			"Among 5 design sites we track, Acme has the 4th fastest LCP.",
		);
		expect(lines[3]).toBe(
			"INP has improved by 72 ms over the last 10 weeks, from 260 ms to 188 ms.",
		);
	});

	it("says a passing site passes", () => {
		const [first] = siteInsights({
			name: "Fast",
			category: "AI",
			snapshot: {
				metrics: { LCP: 1500, CLS: 0.01, INP: 90 },
				period,
				history: [],
			},
			peers: [],
		});
		expect(first).toContain("Fast passes Core Web Vitals");
	});
});
