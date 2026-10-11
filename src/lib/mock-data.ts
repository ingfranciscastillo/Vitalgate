export type MetricKey = "LCP" | "INP" | "CLS" | "FCP" | "TBT" | "PERF";

export const METRIC_META: Record<
	MetricKey,
	{
		label: string;
		unit: string;
		good: number;
		bad: number;
		lowerIsBetter: boolean;
	}
> = {
	LCP: {
		label: "Largest Contentful Paint",
		unit: "ms",
		good: 2500,
		bad: 4000,
		lowerIsBetter: true,
	},
	INP: {
		label: "Interaction to Next Paint",
		unit: "ms",
		good: 200,
		bad: 500,
		lowerIsBetter: true,
	},
	CLS: {
		label: "Cumulative Layout Shift",
		unit: "",
		good: 0.1,
		bad: 0.25,
		lowerIsBetter: true,
	},
	FCP: {
		label: "First Contentful Paint",
		unit: "ms",
		good: 1800,
		bad: 3000,
		lowerIsBetter: true,
	},
	TBT: {
		label: "Total Blocking Time",
		unit: "ms",
		good: 200,
		bad: 600,
		lowerIsBetter: true,
	},
	PERF: {
		label: "Performance Score",
		unit: "",
		good: 90,
		bad: 50,
		lowerIsBetter: false,
	},
};

export type Severity = "warn" | "fail";
export type Action = "comment" | "block";

export interface Budget {
	metric: MetricKey;
	max: number;
	severity: Severity;
	action: Action;
}

export interface Repo {
	id: string;
	name: string;
	fullName: string;
	defaultBranch: string;
	health: number;
	openPrs: number;
	failingPrs: number;
	lastRun: string;
	budgets: Budget[];
}

export type PrStatus = "passing" | "warning" | "failing";

export interface PullRequest {
	id: string;
	repoId: string;
	number: number;
	title: string;
	author: string;
	branch: string;
	status: PrStatus;
	openedAt: string;
	metrics: Record<MetricKey, number>;
	baseline: Record<MetricKey, number>;
}

export type AlertChannel = "slack" | "discord" | "webhook" | "email";
export type AlertLevel = "info" | "warning" | "critical";
export type AlertRuleKey =
	| "budget_violation"
	| "regression_3day"
	| "score_below_80"
	| "weekly_digest";
export type NotificationPrefKey =
	| "critical_alerts"
	| "warning_alerts"
	| "daily_digest"
	| "weekly_summary"
	| "getting_started";
export type IntegrationProvider = "slack" | "discord" | "webhook";
/** Integrations connected through an OAuth redirect (webhooks are pasted in instead). */
export type OAuthIntegrationProvider = "slack" | "discord";

export interface AlertItem {
	id: string;
	repoId: string;
	channel: AlertChannel;
	level: AlertLevel;
	title: string;
	message: string;
	createdAt: string;
}

function rand(seed: number) {
	let s = seed;
	return () => {
		s = (s * 9301 + 49297) % 233280;
		return s / 233280;
	};
}

const defaultBudgets: Budget[] = [
	{ metric: "LCP", max: 2500, severity: "fail", action: "block" },
	{ metric: "INP", max: 200, severity: "fail", action: "block" },
	{ metric: "CLS", max: 0.1, severity: "warn", action: "comment" },
	{ metric: "FCP", max: 1800, severity: "warn", action: "comment" },
	{ metric: "TBT", max: 300, severity: "warn", action: "comment" },
	{ metric: "PERF", max: 90, severity: "fail", action: "block" },
];

export const REPOS: Repo[] = [
	{
		id: "web",
		name: "web",
		fullName: "acme/web",
		defaultBranch: "main",
		health: 92,
		openPrs: 4,
		failingPrs: 1,
		lastRun: "2m ago",
		budgets: defaultBudgets,
	},
	{
		id: "storefront",
		name: "storefront",
		fullName: "acme/storefront",
		defaultBranch: "main",
		health: 78,
		openPrs: 7,
		failingPrs: 2,
		lastRun: "12m ago",
		budgets: defaultBudgets,
	},
	{
		id: "docs",
		name: "docs",
		fullName: "acme/docs",
		defaultBranch: "main",
		health: 98,
		openPrs: 1,
		failingPrs: 0,
		lastRun: "1h ago",
		budgets: defaultBudgets,
	},
	{
		id: "admin",
		name: "admin",
		fullName: "acme/admin",
		defaultBranch: "main",
		health: 64,
		openPrs: 3,
		failingPrs: 3,
		lastRun: "5m ago",
		budgets: defaultBudgets,
	},
];

const titles = [
	"Refactor product gallery to use lazy hydration",
	"Adopt next-gen image format on hero",
	"Inline critical CSS for above-the-fold",
	"Move analytics script to web worker",
	"Replace moment with date-fns",
	"Split checkout bundle by route",
	"Add Suspense boundaries to catalog",
	"Upgrade React 19 + compiler",
	"Cache product reviews on edge",
	"Migrate carousel to native scroll-snap",
	"Defer third-party chat widget",
	"Preload fonts and remove FOIT",
];

const authors = ["lucia", "marcus", "priya", "ngozi", "kenji", "rafa"];

function pickStatus(
	metrics: Record<MetricKey, number>,
	budgets: Budget[],
): PrStatus {
	let worst: PrStatus = "passing";
	for (const b of budgets) {
		const v = metrics[b.metric];
		const violates = b.metric === "PERF" ? v < b.max : v > b.max;
		if (violates) {
			if (b.severity === "fail") return "failing";
			worst = "warning";
		}
	}
	return worst;
}

export const PRS: PullRequest[] = (() => {
	const r = rand(7);
	const out: PullRequest[] = [];
	let id = 1;
	for (const repo of REPOS) {
		const count = 3 + Math.floor(r() * 2);
		for (let i = 0; i < count; i++) {
			const baseline: Record<MetricKey, number> = {
				LCP: 1800 + Math.floor(r() * 600),
				INP: 120 + Math.floor(r() * 80),
				CLS: +(0.04 + r() * 0.06).toFixed(3),
				FCP: 1200 + Math.floor(r() * 500),
				TBT: 100 + Math.floor(r() * 150),
				PERF: 88 + Math.floor(r() * 10),
			};
			const drift = (r() - 0.3) * 1.4;
			const metrics: Record<MetricKey, number> = {
				LCP: Math.max(800, baseline.LCP + Math.floor(drift * 800)),
				INP: Math.max(40, baseline.INP + Math.floor(drift * 120)),
				CLS: +Math.max(0, baseline.CLS + drift * 0.08).toFixed(3),
				FCP: Math.max(600, baseline.FCP + Math.floor(drift * 500)),
				TBT: Math.max(20, baseline.TBT + Math.floor(drift * 200)),
				PERF: Math.min(
					100,
					Math.max(20, baseline.PERF - Math.floor(drift * 18)),
				),
			};
			const status = pickStatus(metrics, repo.budgets);
			out.push({
				id: String(id),
				repoId: repo.id,
				number: 1000 + id,
				title: titles[(id - 1) % titles.length],
				author: authors[(id - 1) % authors.length],
				branch: `feat/${titles[(id - 1) % titles.length]
					.toLowerCase()
					.replace(/[^a-z0-9]+/g, "-")
					.slice(0, 24)}`,
				status,
				openedAt: `${1 + Math.floor(r() * 14)}d ago`,
				metrics,
				baseline,
			});
			id++;
		}
	}
	return out;
})();

export function timeSeries(repoId: string, days = 30) {
	const r = rand(repoId.length * 17 + days);
	const out: {
		date: string;
		lcp: number;
		inp: number;
		cls: number;
		perf: number;
	}[] = [];
	let lcp = 2100,
		inp = 160,
		cls = 0.07,
		perf = 92;
	for (let i = days - 1; i >= 0; i--) {
		lcp += (r() - 0.5) * 180;
		inp += (r() - 0.5) * 30;
		cls += (r() - 0.5) * 0.015;
		perf += (r() - 0.5) * 3;
		const d = new Date();
		d.setDate(d.getDate() - i);
		out.push({
			date: d.toISOString().slice(5, 10),
			lcp: Math.round(Math.max(1200, lcp)),
			inp: Math.round(Math.max(60, inp)),
			cls: +Math.max(0.01, cls).toFixed(3),
			perf: Math.round(Math.min(100, Math.max(40, perf))),
		});
	}
	return out;
}

export const ALERTS: AlertItem[] = [
	{
		id: "a1",
		repoId: "admin",
		channel: "slack",
		level: "critical",
		title: "LCP budget exceeded",
		message: "PR #1010 raised LCP to 4.2s (+1.4s vs main)",
		createdAt: "5m ago",
	},
	{
		id: "a2",
		repoId: "storefront",
		channel: "discord",
		level: "warning",
		title: "CLS trending up",
		message: "3-day rolling average crossed 0.12",
		createdAt: "1h ago",
	},
	{
		id: "a3",
		repoId: "web",
		channel: "email",
		level: "info",
		title: "Weekly digest",
		message: "12 PRs analyzed, 1 regression caught",
		createdAt: "1d ago",
	},
	{
		id: "a4",
		repoId: "admin",
		channel: "slack",
		level: "critical",
		title: "Performance score dropped",
		message: "Score fell from 91 to 64 on PR #1011",
		createdAt: "2d ago",
	},
];

export function getRepo(id: string) {
	return REPOS.find((r) => r.id === id);
}
export function getPr(id: string) {
	return PRS.find((p) => p.id === id);
}

export function formatMetric(key: MetricKey, value: number) {
	if (key === "CLS") return value.toFixed(3);
	if (key === "PERF") return String(Math.round(value));
	return `${(value / 1000).toFixed(2)}s`;
}

export function metricDelta(key: MetricKey, current: number, baseline: number) {
	const diff = current - baseline;
	const pct = baseline === 0 ? 0 : (diff / baseline) * 100;
	const better = key === "PERF" ? diff > 0 : diff < 0;
	return { diff, pct, better };
}
