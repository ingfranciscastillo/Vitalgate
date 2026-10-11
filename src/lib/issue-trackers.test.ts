import { describe, expect, it } from "vitest";
import {
	parseResultsTable,
	resultsAsJiraTable,
	resultsAsMarkdown,
} from "@/lib/issue-trackers";
import { renderPrComment } from "@/lib/pr-comment";

const comment = renderPrComment({
	status: "failing",
	metrics: { PERF: 43, LCP: 10_580, CLS: 0, TBT: 1030 },
	baseline: { PERF: 51, LCP: 9620, CLS: 0, TBT: 690 },
	budgets: [
		{ metric: "PERF", max: 90, severity: "fail" },
		{ metric: "LCP", max: 2500, severity: "fail" },
		{ metric: "CLS", max: 0.1, severity: "warn" },
		{ metric: "TBT", max: 300, severity: "warn" },
	],
	reportUrl: "https://vitalgate.example/pulls/p1",
	isFirstRun: false,
	runs: 3,
});

describe("tracker issue bodies", () => {
	it("keeps only the results table rows", () => {
		const { header, rows } = parseResultsTable(comment);
		expect(header[0]).toBe("Metric");
		expect(rows).toHaveLength(4);
		expect(rows[0][0]).toBe("Performance score");
	});

	it("drops the PR comment's headline, footer and HTML for Linear", () => {
		const md = resultsAsMarkdown(comment);
		expect(md.startsWith("| Metric |")).toBe(true);
		expect(md).not.toContain("<sub>");
		expect(md).not.toContain("<!--");
		expect(md).not.toContain("**Vitalgate:**");
	});

	it("builds a Jira wiki table with Jira's icons and coloured changes", () => {
		const jira = resultsAsJiraTable(comment);
		const [head, ...rows] = jira.split("\n");
		expect(head.startsWith("||Metric||This PR||")).toBe(true);
		expect(rows).toHaveLength(4);
		expect(rows[0]).toContain("(x)");
		expect(rows[2]).toContain("(/)");
		expect(rows[0]).toContain("{color:#de350b}-8{color}");
		expect(jira).not.toMatch(/[❌✅🔴🟢]/u);
	});
});
