import { describe, expect, it } from "vitest";
import {
	type AlertContext,
	type AlertToDeliver,
	discordPayload,
	emailSubject,
	renderAlertEmail,
	slackPayload,
} from "@/lib/alert-messages";
import { escapeHtml } from "@/lib/html";
import { PR_COMMENT_MARKER, renderPrComment } from "@/lib/pr-comment";

// PR titles and authors come from whoever opened the pull request.
const ctx: AlertContext = {
	organizationId: "org",
	repoFullName: "acme/web",
	prNumber: 12,
	pullId: "p1",
	prTitle:
		"<!channel> <script>alert(1)</script> [free money](https://evil.example) @everyone\r\nBcc: x@evil",
	prAuthor: "mallory<@123>",
};
const alerts: AlertToDeliver[] = [
	{
		level: "critical",
		title: "Budget violation",
		message: "PR #12 exceeded the LCP budget.",
	},
	{
		level: "warning",
		title: "3-day regression",
		message: "PR #12: LCP worsened.",
	},
];
const links = {
	pr: "https://github.com/acme/web/pull/12",
	app: "https://vitalgate.example/pulls/p1",
};

describe("Slack alert", () => {
	const { text } = slackPayload(alerts, ctx, links);

	it("escapes mentions and links in untrusted text", () => {
		expect(text).not.toContain("<!channel>");
		expect(text).not.toContain("<@123>");
		expect(text).toContain("&lt;!channel&gt;");
	});

	it("keeps its own links", () => {
		expect(text).toContain(`<${links.pr}|acme/web #12>`);
		expect(text).toContain(`<${links.app}|View in Vitalgate>`);
	});
});

describe("Discord alert", () => {
	const payload = discordPayload(alerts, ctx, links);

	it("never pings anyone", () => {
		expect(payload.allowed_mentions).toEqual({ parse: [] });
	});

	it("neutralizes markdown links in untrusted text but keeps its own", () => {
		const description = payload.embeds[0].description;
		expect(description).not.toContain("[free money](https://evil.example)");
		expect(description).toContain(`[Open the pull request](${links.pr})`);
	});

	it("sends one embed per alert, colored by level", () => {
		expect(payload.embeds).toHaveLength(2);
		expect(payload.embeds[0].color).not.toBe(payload.embeds[1].color);
	});
});

describe("alert email", () => {
	it("escapes HTML", () => {
		const html = renderAlertEmail(alerts, ctx, links);
		expect(html).not.toContain("<script>");
		expect(html).toContain("&lt;script&gt;");
	});

	it("has a single-line subject that names the alerts", () => {
		expect(emailSubject(alerts, ctx)).toBe(
			"[Vitalgate] 2 alerts on acme/web #12",
		);
		expect(emailSubject([alerts[0]], ctx)).toBe(
			"[Vitalgate] Budget violation on acme/web #12",
		);
		expect(
			emailSubject(alerts, { ...ctx, repoFullName: "a\r\nb" }),
		).not.toMatch(/[\r\n]/);
	});
});

describe("escapeHtml", () => {
	it("escapes the characters that matter in HTML", () => {
		expect(escapeHtml(`<a href="x" onclick='y'>&</a>`)).toBe(
			"&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;&lt;/a&gt;",
		);
	});
});

describe("PR comment", () => {
	const budgets = [
		{ metric: "LCP" as const, max: 2500, severity: "fail" as const },
		{ metric: "PERF" as const, max: 90, severity: "fail" as const },
		{ metric: "CLS" as const, max: 0.1, severity: "warn" as const },
	];

	it("starts with the marker the workflow and app use to find it", () => {
		const md = renderPrComment({
			status: "passing",
			metrics: { LCP: 2000 },
			baseline: {},
			budgets,
			reportUrl: "https://vitalgate.example/pulls/p1",
			isFirstRun: true,
			runs: 1,
		});
		expect(md.startsWith(PR_COMMENT_MARKER)).toBe(true);
		expect(md).toContain("all performance budgets passed");
	});

	it("marks failures, warnings and changes vs baseline", () => {
		const md = renderPrComment({
			status: "failing",
			metrics: { LCP: 4200, PERF: 62, CLS: 0.2 },
			baseline: { LCP: 2100, PERF: 88, CLS: 0.2 },
			budgets,
			reportUrl: "https://vitalgate.example/pulls/p1",
			isFirstRun: false,
			runs: 3,
		});
		expect(md).toContain("a required performance budget was exceeded");
		expect(md).toContain("Median of 3 Lighthouse lab runs");
		expect(md).toMatch(
			/Largest Contentful Paint \| 4\.20s \| \+100% 🔴 \| ≤ 2\.50s \(required\) \| ❌/,
		);
		expect(md).toMatch(
			/Performance score \| 62 \| -26 🔴 \| ≥ 90 \(required\) \| ❌/,
		);
		expect(md).toMatch(
			/Cumulative Layout Shift \| 0\.200 \| no change \| ≤ 0\.100 \| ⚠️/,
		);
	});

	it("leaves out metrics the run didn't measure", () => {
		const md = renderPrComment({
			status: "passing",
			metrics: { LCP: 2000 },
			baseline: {},
			budgets,
			reportUrl: "https://vitalgate.example/pulls/p1",
			isFirstRun: true,
			runs: 1,
		});
		expect(md).not.toContain("Interaction to Next Paint");
		expect(md).not.toContain("Performance score");
	});
});
