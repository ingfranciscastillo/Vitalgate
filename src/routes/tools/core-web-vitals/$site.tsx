import {
	CheckCircleIcon,
	InfoIcon,
	WarningCircleIcon,
} from "@phosphor-icons/react";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { CruxMetricsView, formatCruxDay } from "@/components/crux-metrics-view";
import { MarketingShell } from "@/components/marketing-shell";
import { Reveal } from "@/components/reveal";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ogImageMeta, SITE_URL } from "@/lib/seo";
import { formatMetric, siteInsights } from "@/lib/site-insights";
import { getSiteReport } from "@/lib/site-report.functions";

const ASSESSMENT = {
	passed: {
		icon: CheckCircleIcon,
		className: "text-success",
		label: "passes",
	},
	failed: {
		icon: WarningCircleIcon,
		className: "text-destructive",
		label: "fails",
	},
	insufficient: {
		icon: InfoIcon,
		className: "text-muted-foreground",
		label: "has too little data for",
	},
} as const;

export const Route = createFileRoute("/tools/core-web-vitals/$site")({
	loader: async ({ params }) => {
		const report = await getSiteReport({ data: params.site });
		if (!report) throw notFound();
		return report;
	},
	head: ({ loaderData: r }) => {
		if (!r) return {};
		const url = `${SITE_URL}/tools/core-web-vitals/${r.site.slug}`;
		const m = r.snapshot?.metrics;
		const month = r.snapshot
			? new Date(`${r.snapshot.period.lastDate}T00:00:00Z`).toLocaleDateString(
					"en-US",
					{ month: "long", year: "numeric", timeZone: "UTC" },
				)
			: "";
		const title = `${r.site.name} Core Web Vitals: INP, LCP and CLS from real users${month ? ` (${month})` : ""}`;
		const description = m
			? `${r.site.name} ${ASSESSMENT[r.assessment ?? "insufficient"].label} Core Web Vitals. Real Chrome users, 75th percentile: ${[
					m.LCP != null ? `LCP ${formatMetric("LCP", m.LCP)}` : null,
					m.INP != null ? `INP ${formatMetric("INP", m.INP)}` : null,
					m.CLS != null ? `CLS ${formatMetric("CLS", m.CLS)}` : null,
				]
					.filter(Boolean)
					.join(", ")}.`
			: `Core Web Vitals for ${r.site.name} from the Chrome UX Report.`;
		return {
			meta: [
				{ title },
				{ name: "description", content: description },
				// Without data there's nothing worth indexing.
				...(r.snapshot ? [] : [{ name: "robots", content: "noindex" }]),
				{ property: "og:type", content: "article" },
				{ property: "og:url", content: url },
				{ property: "og:title", content: title },
				{ property: "og:description", content: description },
				...ogImageMeta("/og/core-web-vitals.png"),
				{ name: "twitter:card", content: "summary_large_image" },
			],
			links: [{ rel: "canonical", href: url }],
			scripts: [
				{
					type: "application/ld+json",
					children: JSON.stringify({
						"@context": "https://schema.org",
						"@type": "BreadcrumbList",
						itemListElement: [
							{
								"@type": "ListItem",
								position: 1,
								name: "Core Web Vitals checker",
								item: `${SITE_URL}/tools/core-web-vitals`,
							},
							{
								"@type": "ListItem",
								position: 2,
								name: r.site.name,
								item: url,
							},
						],
					}),
				},
			],
		};
	},
	component: SitePage,
});

function SitePage() {
	const r = Route.useLoaderData();
	const { site, snapshot, assessment, budgets, peers } = r;
	const verdict = ASSESSMENT[assessment ?? "insufficient"];
	const VerdictIcon = verdict.icon;
	const insights = snapshot
		? siteInsights({
				name: site.name,
				category: site.category,
				snapshot,
				peers,
			})
		: [];

	return (
		<MarketingShell>
			<article className="mx-auto max-w-4xl px-5 pt-16 pb-24">
				<nav aria-label="Breadcrumb" className="text-xs text-muted-foreground">
					<Link to="/tools/core-web-vitals" className="hover:text-foreground">
						Core Web Vitals checker
					</Link>{" "}
					/ {site.category} / {site.name}
				</nav>
				<Reveal>
					<h1 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">
						{site.name} Core Web Vitals
					</h1>
					<p className="mt-3 max-w-2xl text-muted-foreground">
						How real Chrome users experience{" "}
						<span className="font-mono text-foreground">
							{site.origin.replace(/^https:\/\//, "")}
						</span>
						, from Google's Chrome UX Report: the 75th percentile of visits on
						every device.
					</p>
				</Reveal>

				{snapshot ? (
					<>
						<Card className="mt-8 p-5">
							<div className="flex flex-wrap items-start justify-between gap-3">
								<div>
									<div
										className={`flex items-center gap-2 font-semibold ${verdict.className}`}
									>
										<VerdictIcon className="h-5 w-5" weight="fill" />
										{site.name} {verdict.label} Core Web Vitals
									</div>
									<p className="mt-1 text-xs text-muted-foreground">
										{formatCruxDay(snapshot.period.firstDate)} –{" "}
										{formatCruxDay(snapshot.period.lastDate)}, all devices
									</p>
								</div>
								<span className="text-[10px] text-muted-foreground">
									Chrome UX Report
								</span>
							</div>
							<CruxMetricsView snapshot={snapshot} />
						</Card>

						{insights.length > 0 && (
							<section className="mt-10">
								<h2 className="text-xl font-bold tracking-tight">
									What the numbers say
								</h2>
								<ul className="mt-3 max-w-2xl list-disc space-y-2 pl-5 text-muted-foreground">
									{insights.map((line) => (
										<li key={line}>{line}</li>
									))}
								</ul>
							</section>
						)}

						{budgets.length > 0 && (
							<Card className="mt-10 p-6">
								<h2 className="text-lg font-semibold">
									Keep a site like this from getting slower
								</h2>
								<p className="mt-2 max-w-2xl text-sm text-muted-foreground">
									Real-user data shows a regression weeks after it ships.
									Vitalgate runs Lighthouse on every pull request and fails the
									check when a change breaks budgets like these:{" "}
									{budgets
										.map(
											(b) => `${b.metric} ≤ ${formatMetric(b.metric, b.max)}`,
										)
										.join(", ")}
									.
								</p>
								<div className="mt-4 flex flex-wrap gap-3">
									<Link to="/login">
										<Button className="bg-brand text-brand-foreground hover:bg-brand/90">
											Connect a repo for free
										</Button>
									</Link>
									<Link to="/tools/core-web-vitals" search={{}}>
										<Button variant="outline">Check your own site</Button>
									</Link>
								</div>
							</Card>
						)}
					</>
				) : (
					<Card className="mt-8 p-5 text-sm text-muted-foreground">
						The Chrome UX Report has no recent data for {site.name}. Check again
						later, or try another site with the{" "}
						<Link
							to="/tools/core-web-vitals"
							className="text-primary hover:underline"
						>
							Core Web Vitals checker
						</Link>
						.
					</Card>
				)}

				{peers.length > 0 && (
					<section className="mt-12">
						<h2 className="text-xl font-bold tracking-tight">
							Other {site.category.toLowerCase()} sites
						</h2>
						<div className="mt-4 overflow-x-auto">
							<table className="w-full min-w-[420px] text-sm">
								<thead className="text-left text-xs text-muted-foreground">
									<tr>
										<th className="py-2 pr-3 font-medium">Site</th>
										<th className="py-2 pr-3 font-medium">Core Web Vitals</th>
										<th className="py-2 pr-3 text-right font-medium">LCP</th>
										<th className="py-2 pr-3 text-right font-medium">INP</th>
										<th className="py-2 text-right font-medium">CLS</th>
									</tr>
								</thead>
								<tbody className="divide-y divide-border">
									{peers.map((p) => (
										<tr key={p.slug}>
											<td className="py-2 pr-3">
												<Link
													to="/tools/core-web-vitals/$site"
													params={{ site: p.slug }}
													className="font-medium hover:text-primary"
												>
													{p.name}
												</Link>
											</td>
											<td
												className={`py-2 pr-3 ${p.assessment === "passed" ? "text-success" : p.assessment === "failed" ? "text-destructive" : "text-muted-foreground"}`}
											>
												{p.assessment === "passed"
													? "Passes"
													: p.assessment === "failed"
														? "Fails"
														: "Not enough data"}
											</td>
											<td className="py-2 pr-3 text-right font-mono">
												{p.lcp != null ? formatMetric("LCP", p.lcp) : "—"}
											</td>
											<td className="py-2 pr-3 text-right font-mono">
												{p.inp != null ? formatMetric("INP", p.inp) : "—"}
											</td>
											<td className="py-2 text-right font-mono">
												{p.cls != null ? formatMetric("CLS", p.cls) : "—"}
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					</section>
				)}
			</article>
		</MarketingShell>
	);
}
