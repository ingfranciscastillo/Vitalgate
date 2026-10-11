/**
 * Single source of truth for the /compare pages. Competitor facts come from
 * their own docs and pricing pages — re-check them quarterly and bump
 * CHECKED_ON. Keep them fair: these pages are read by people comparing,
 * and they will verify.
 */

export const COMPARE_CHECKED_ON = "October 2026";

export interface ComparisonRow {
	feature: string;
	vitalgate: string;
	them: string;
}

export interface Competitor {
	slug: string;
	name: string;
	website: string;
	/** One line: what the product is. */
	tagline: string;
	/** Meta description and hub card text. */
	description: string;
	/** Two or three sentences for scanners. */
	tldr: string;
	pricing: string;
	rows: ComparisonRow[];
	/** Longer comparisons, one per dimension. */
	sections: { title: string; body: string }[];
	themBestFor: string[];
	vitalgateBestFor: string[];
	/** How to switch from this competitor, for pages where people commonly do. */
	migration?: {
		intro: string;
		steps: { title: string; body: string }[];
		/** Their config names → Vitalgate budgets. */
		mapping?: { from: string; to: string }[];
		note?: string;
	};
}

const VITALGATE_PRICING =
	"Free for 1 repository; Pro is $29/month per workspace for unlimited repositories.";

export const COMPETITORS: Competitor[] = [
	{
		slug: "lighthouse-ci",
		name: "Lighthouse CI",
		website: "https://github.com/GoogleChrome/lighthouse-ci",
		tagline: "Google's open-source toolkit for running Lighthouse in CI.",
		description:
			"Vitalgate vs Lighthouse CI: both run Lighthouse on pull requests. Lighthouse CI is free and do-it-yourself; Vitalgate sets it up for you and adds budgets, PR comments, alerts and history.",
		tldr: "Both fail a pull request when Lighthouse says it got slower. Lighthouse CI is free and fully configurable, but you write the config, manage tokens and host a server if you want history. Vitalgate commits the workflow for you and adds a dashboard, PR comments, alerts and real-user data.",
		pricing:
			"Free and open source. History and report diffs need a Lighthouse CI server you host yourself.",
		rows: [
			{
				feature: "Setup",
				vitalgate:
					"Install the GitHub App, pick repos; the workflow is committed for you",
				them: "Write lighthouserc and a workflow; add a token secret per repo",
			},
			{
				feature: "Budgets",
				vitalgate:
					"LCP, CLS, FCP, TBT and score, edited in the dashboard; required or warning",
				them: "Any Lighthouse audit, as assertions in a config file",
			},
			{
				feature: "Pull request feedback",
				vitalgate: "A Vitalgate check plus a results comment, updated per push",
				them: "A status check (via its GitHub App or a personal token)",
			},
			{
				feature: "Preview deployments",
				vitalgate:
					"Audits the preview URL Vercel, Netlify or Render reports, no build",
				them: "Possible with your own workflow scripting",
			},
			{
				feature: "History and trends",
				vitalgate: "Built in, per repository and pull request",
				them: "Needs a self-hosted Lighthouse CI server",
			},
			{
				feature: "Alerts",
				vitalgate: "Email, Slack, Discord and webhooks",
				them: "None built in",
			},
			{
				feature: "Real-user metrics (INP)",
				vitalgate: "From the Chrome UX Report, per repository",
				them: "No, lab data only",
			},
			{
				feature: "Runs per audit",
				vitalgate: "Three per pull request; the median run is reported",
				them: "Configurable, with median selection",
			},
			{ feature: "Price", vitalgate: VITALGATE_PRICING, them: "Free" },
		],
		sections: [
			{
				title: "Setup and upkeep",
				body: "Lighthouse CI gives you the building blocks: you write the lighthouserc file, the GitHub Actions workflow, and store a token in each repository for status checks. That's flexible, and it's yours to maintain across every repo. Vitalgate detects the package manager, serve script and port, commits the workflow through its GitHub App, and authenticates runs with GitHub's OIDC tokens, so there's no secret to copy.",
			},
			{
				title: "Budgets and feedback",
				body: "Lighthouse CI can assert on any audit Lighthouse produces, which is more than Vitalgate covers. Vitalgate focuses on the metrics that matter for Core Web Vitals and the overall score, lets non-engineers change budgets from a dashboard, and explains failures in a pull request comment rather than only a red status.",
			},
			{
				title: "Where Lighthouse CI is stronger",
				body: "It's free, it runs anywhere (not just GitHub), it can assert on every Lighthouse audit, and it can audit several URLs per build. If you want full control and are happy to host and maintain it, it's a great choice.",
			},
		],
		themBestFor: [
			"Teams who want full control over every Lighthouse assertion",
			"CI systems other than GitHub Actions",
			"Budgets of zero, with time to host and maintain a server",
		],
		vitalgateBestFor: [
			"Teams on GitHub who want budgets working in minutes, across many repos",
			"Auditing Vercel, Netlify or Render previews without building in CI",
			"Alerts and trends without hosting anything",
		],
		migration: {
			intro:
				"Already running Lighthouse CI? Switching takes a few minutes per repository, and your thresholds carry over.",
			steps: [
				{
					title: "Connect the repository",
					body: "Install the Vitalgate GitHub App on the repository and connect it. Vitalgate commits .github/workflows/vitalgate.yml, or audits your preview deployments if Vercel, Netlify or Render already builds them.",
				},
				{
					title: "Copy your assertions into budgets",
					body: "Open the repository's Budgets tab and enter the thresholds from your lighthouserc file, using the mapping below. An assertion at the error level becomes a required budget; warn becomes a warning.",
				},
				{
					title: "Swap the required check",
					body: 'In your branch protection rules, require the "Vitalgate" check instead of the Lighthouse CI status.',
				},
				{
					title: "Remove what you no longer need",
					body: "Delete your Lighthouse CI workflow, the LHCI_GITHUB_APP_TOKEN or LHCI_GITHUB_TOKEN secret, and the Lighthouse CI GitHub App. Vitalgate authenticates with GitHub's OIDC tokens, so there's no secret to add.",
				},
			],
			mapping: [
				{
					from: "categories:performance  minScore: 0.9",
					to: "Performance score ≥ 90",
				},
				{
					from: "largest-contentful-paint  maxNumericValue: 2500",
					to: "LCP ≤ 2500 ms",
				},
				{
					from: "cumulative-layout-shift  maxNumericValue: 0.1",
					to: "CLS ≤ 0.1",
				},
				{
					from: "first-contentful-paint  maxNumericValue: 1800",
					to: "FCP ≤ 1800 ms",
				},
				{
					from: "total-blocking-time  maxNumericValue: 300",
					to: "TBT ≤ 300 ms",
				},
			],
			note: "Assertions on other audits have no Vitalgate equivalent. Results stored on a Lighthouse CI server don't move over: the first pull request Vitalgate audits becomes the baseline.",
		},
	},
	{
		slug: "calibre",
		name: "Calibre",
		website: "https://calibreapp.com",
		tagline:
			"Web performance monitoring with synthetic tests and real-user data.",
		description:
			"Vitalgate vs Calibre: Calibre monitors your live site around the clock; Vitalgate stops regressions in pull requests before they ship. Features, pricing and who each fits.",
		tldr: "Calibre monitors production: scheduled synthetic tests from many locations, real-user monitoring and detailed reports. Vitalgate guards the pull request: every change is audited and blocked if it breaks a budget. Many teams need the first; every team shipping often needs the second.",
		pricing:
			"Starter $75/month, Team $150/month, Company $1,500/month billed yearly; 15-day free trial.",
		rows: [
			{
				feature: "Main job",
				vitalgate: "Block regressions in pull requests",
				them: "Monitor live sites continuously",
			},
			{
				feature: "Pull request checks",
				vitalgate: "Built in: a GitHub check and a results comment",
				them: "Possible through its CLI and API in your CI",
			},
			{
				feature: "Synthetic monitoring",
				vitalgate: "Per pull request, on GitHub Actions",
				them: "Scheduled tests, many locations and devices",
			},
			{
				feature: "Real-user data",
				vitalgate: "Chrome UX Report (p75, 28 days)",
				them: "Chrome UX Report plus its own RUM",
			},
			{
				feature: "Alerts",
				vitalgate: "Email, Slack, Discord",
				them: "Yes",
			},
			{
				feature: "Free plan",
				vitalgate: "Yes, 1 repository",
				them: "No, 15-day trial",
			},
			{
				feature: "Price",
				vitalgate: VITALGATE_PRICING,
				them: "From $75/month",
			},
		],
		sections: [
			{
				title: "Before release vs after release",
				body: "Calibre tells you how your production site is doing and when it changed. Vitalgate runs on each pull request, so a slow change fails its check before it's merged. If regressions keep reaching production, the pull request is the cheaper place to catch them.",
			},
			{
				title: "Where Calibre is stronger",
				body: "Calibre has scheduled tests from many locations and devices, its own real-user monitoring, deeper reports and SSO on larger plans. Vitalgate's real-user view is the Chrome UX Report only, which needs enough public traffic to show data.",
			},
		],
		themBestFor: [
			"Monitoring production around the clock from many locations",
			"Teams that need their own real-user monitoring",
			"Sites behind logins or with low public traffic",
		],
		vitalgateBestFor: [
			"Stopping regressions before merge, on every pull request",
			"Small teams that want a free plan to start",
			"Teams already on GitHub Actions and Vercel or Netlify previews",
		],
	},
	{
		slug: "speedcurve",
		name: "SpeedCurve",
		website: "https://www.speedcurve.com",
		tagline:
			"Synthetic and real-user performance monitoring, now part of Embrace.",
		description:
			"Vitalgate vs SpeedCurve: SpeedCurve is full synthetic and RUM monitoring; Vitalgate enforces performance budgets on pull requests. How they differ and when to use each.",
		tldr: "SpeedCurve is a full monitoring platform with its own real-user monitoring and synthetic tests, built for teams that study performance closely. Vitalgate is narrower: it enforces budgets on every pull request so regressions don't ship, with a free plan for one repository.",
		pricing:
			"Starter from $90/month, Growth $576/month, Enterprise custom; plans are built from RUM page views and synthetic checks.",
		rows: [
			{
				feature: "Main job",
				vitalgate: "Block regressions in pull requests",
				them: "Monitor and analyse performance in depth",
			},
			{
				feature: "Pull request checks",
				vitalgate: "Built in: a GitHub check and a results comment",
				them: "Through its deploy API and CI integrations",
			},
			{
				feature: "Real-user data",
				vitalgate: "Chrome UX Report (p75, 28 days)",
				them: "Its own RUM, page-view level",
			},
			{
				feature: "Synthetic tests",
				vitalgate: "Median of three Lighthouse runs per pull request",
				them: "Scheduled, many locations, filmstrips",
			},
			{
				feature: "Free plan",
				vitalgate: "Yes, 1 repository",
				them: "No",
			},
			{
				feature: "Price",
				vitalgate: VITALGATE_PRICING,
				them: "From $90/month",
			},
		],
		sections: [
			{
				title: "Depth vs guardrails",
				body: "SpeedCurve gives performance specialists detailed RUM, filmstrips and competitive benchmarks. Vitalgate gives every developer a pass or fail on their own pull request. One helps you understand performance; the other keeps it from getting worse with each merge.",
			},
			{
				title: "Where SpeedCurve is stronger",
				body: "Its own real-user monitoring works on any site with the snippet installed, including low-traffic and logged-in pages, and its synthetic testing is far more detailed. Vitalgate's real-user view needs the site to be in the Chrome UX Report.",
			},
		],
		themBestFor: [
			"Performance teams who need page-view level RUM",
			"In-depth analysis, filmstrips and competitor benchmarks",
			"Larger budgets",
		],
		vitalgateBestFor: [
			"Making performance a pull request check every developer sees",
			"Teams starting out, with a free plan",
			"GitHub teams deploying previews to Vercel, Netlify or Render",
		],
	},
];

export function getCompetitor(slug: string): Competitor | undefined {
	return COMPETITORS.find((c) => c.slug === slug);
}
