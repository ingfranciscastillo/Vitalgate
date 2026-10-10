import { describe, expect, it } from "vitest";
import {
	assessCoreWebVitals,
	cruxRating,
	parseCruxHistory,
	parseCruxRecord,
	suggestBudgets,
	toOrigin,
} from "@/lib/crux";

const period = {
	firstDate: { year: 2026, month: 9, day: 8 },
	lastDate: { year: 2026, month: 10, day: 5 },
};

describe("parseCruxRecord", () => {
	it("reads p75s, including CLS sent as a string", () => {
		const parsed = parseCruxRecord({
			record: {
				key: { origin: "https://example.com" },
				metrics: {
					interaction_to_next_paint: { percentiles: { p75: 182 } },
					largest_contentful_paint: { percentiles: { p75: 2310 } },
					cumulative_layout_shift: { percentiles: { p75: "0.07" } },
				},
				collectionPeriod: period,
			},
		});
		expect(parsed).toEqual({
			metrics: { INP: 182, LCP: 2310, CLS: 0.07 },
			period: { firstDate: "2026-09-08", lastDate: "2026-10-05" },
		});
	});

	it("returns null without usable metrics", () => {
		expect(parseCruxRecord({})).toBeNull();
		expect(
			parseCruxRecord({ record: { metrics: {}, collectionPeriod: period } }),
		).toBeNull();
	});
});

describe("parseCruxHistory", () => {
	it("pairs weekly p75s with their periods and drops all-null weeks", () => {
		const points = parseCruxHistory({
			record: {
				metrics: {
					interaction_to_next_paint: {
						percentilesTimeseries: { p75s: [null, 240, 190] },
					},
					cumulative_layout_shift: {
						percentilesTimeseries: { p75s: [null, "0.12", "0.08"] },
					},
				},
				collectionPeriods: [
					{
						firstDate: period.firstDate,
						lastDate: { year: 2026, month: 9, day: 21 },
					},
					{
						firstDate: period.firstDate,
						lastDate: { year: 2026, month: 9, day: 28 },
					},
					{ firstDate: period.firstDate, lastDate: period.lastDate },
				],
			},
		});
		expect(points).toEqual([
			{ date: "2026-09-28", INP: 240, LCP: null, CLS: 0.12 },
			{ date: "2026-10-05", INP: 190, LCP: null, CLS: 0.08 },
		]);
	});
});

describe("cruxRating", () => {
	it("applies the Core Web Vitals thresholds inclusively", () => {
		expect(cruxRating("INP", 200)).toBe("good");
		expect(cruxRating("INP", 201)).toBe("needs-improvement");
		expect(cruxRating("INP", 501)).toBe("poor");
		expect(cruxRating("CLS", 0.1)).toBe("good");
		expect(cruxRating("CLS", 0.3)).toBe("poor");
	});
});

describe("toOrigin", () => {
	it("keeps only the https origin", () => {
		expect(toOrigin(" https://shop.example.com/a?b=1 ")).toBe(
			"https://shop.example.com",
		);
		expect(toOrigin("http://example.com")).toBeNull();
		expect(toOrigin("example.com")).toBeNull();
	});
});

describe("assessCoreWebVitals", () => {
	it("passes only when every available vital is good", () => {
		expect(assessCoreWebVitals({ LCP: 2000, CLS: 0.05, INP: 150 })).toBe(
			"passed",
		);
		expect(assessCoreWebVitals({ LCP: 2000, CLS: 0.05 })).toBe("passed");
		expect(assessCoreWebVitals({ LCP: 2000, CLS: 0.05, INP: 250 })).toBe(
			"failed",
		);
		expect(assessCoreWebVitals({ INP: 150 })).toBe("insufficient");
	});
});

describe("suggestBudgets", () => {
	it("holds the good line, or today's p75 rounded up", () => {
		expect(suggestBudgets({ LCP: 1900, CLS: 0.137, FCP: 2340 })).toEqual([
			{ metric: "LCP", max: 2500, reason: "keep-good" },
			{ metric: "CLS", max: 0.14, reason: "hold" },
			{ metric: "FCP", max: 2400, reason: "hold" },
		]);
	});
});
