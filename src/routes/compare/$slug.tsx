import { CheckCircleIcon } from "@phosphor-icons/react";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { MarketingShell } from "@/components/marketing-shell";
import { Reveal } from "@/components/reveal";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
	COMPARE_CHECKED_ON,
	COMPETITORS,
	type Competitor,
	getCompetitor,
} from "@/lib/competitors";
import { OG_IMAGE_META, SITE_URL } from "@/lib/seo";

export const Route = createFileRoute("/compare/$slug")({
	loader: ({ params }) => {
		const competitor = getCompetitor(params.slug);
		if (!competitor) throw notFound();
		return competitor;
	},
	head: ({ loaderData: c }) => {
		if (!c) return {};
		const url = `${SITE_URL}/compare/${c.slug}`;
		const title = `Vitalgate vs ${c.name}`;
		return {
			meta: [
				{ title: `${title}: features, pricing and who each fits` },
				{ name: "description", content: c.description },
				{ property: "og:type", content: "article" },
				{ property: "og:url", content: url },
				{ property: "og:title", content: title },
				{ property: "og:description", content: c.description },
				...OG_IMAGE_META,
				{ name: "twitter:card", content: "summary_large_image" },
			],
			links: [{ rel: "canonical", href: url }],
		};
	},
	component: ComparePage,
});

function ComparePage() {
	const c = Route.useLoaderData();
	return (
		<MarketingShell>
			<article className="mx-auto max-w-4xl px-5 pt-20 pb-24">
				<Reveal>
					<Link
						to="/compare"
						className="text-xs text-muted-foreground hover:text-foreground"
					>
						All comparisons
					</Link>
					<h1 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">
						Vitalgate vs {c.name}
					</h1>
					<p className="mt-4 max-w-2xl text-lg text-muted-foreground">
						{c.tldr}
					</p>
				</Reveal>

				<Reveal delay={0.06}>
					<Card className="mt-10 overflow-hidden p-0">
						<div className="overflow-x-auto">
							<table className="w-full text-sm">
								<caption className="sr-only">
									Vitalgate and {c.name} compared
								</caption>
								<thead className="bg-muted/50 text-left">
									<tr>
										<th scope="col" className="w-1/4 px-5 py-3 font-medium">
											<span className="sr-only">Feature</span>
										</th>
										<th scope="col" className="px-5 py-3 font-semibold">
											Vitalgate
										</th>
										<th scope="col" className="px-5 py-3 font-semibold">
											{c.name}
										</th>
									</tr>
								</thead>
								<tbody className="divide-y divide-border">
									{c.rows.map((row) => (
										<tr key={row.feature} className="align-top">
											<th
												scope="row"
												className="px-5 py-3 text-left font-medium text-muted-foreground"
											>
												{row.feature}
											</th>
											<td className="px-5 py-3">{row.vitalgate}</td>
											<td className="px-5 py-3">{row.them}</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					</Card>
					<p className="mt-2 text-xs text-muted-foreground">
						{c.name} details from{" "}
						<a
							href={c.website}
							target="_blank"
							rel="noreferrer"
							className="underline hover:text-foreground"
						>
							its own site
						</a>
						, checked {COMPARE_CHECKED_ON}. {c.name} pricing: {c.pricing}
					</p>
				</Reveal>

				<div className="mt-14 space-y-10">
					{c.sections.map((s) => (
						<section key={s.title}>
							<h2 className="text-xl font-bold tracking-tight">{s.title}</h2>
							<p className="mt-3 max-w-2xl text-muted-foreground">{s.body}</p>
						</section>
					))}
				</div>

				<section className="mt-14 grid gap-4 sm:grid-cols-2">
					<FitCard title={`Choose ${c.name} for`} items={c.themBestFor} />
					<FitCard title="Choose Vitalgate for" items={c.vitalgateBestFor} />
				</section>

				<Card className="mt-14 p-6">
					<h2 className="text-lg font-semibold">
						Try Vitalgate on your next pull request
					</h2>
					<p className="mt-2 max-w-2xl text-sm text-muted-foreground">
						Free for one repository. Install the GitHub App, pick a repo, and
						the next pull request gets a performance check.
					</p>
					<div className="mt-4 flex flex-wrap gap-3">
						<Link to="/login">
							<Button className="bg-brand text-brand-foreground hover:bg-brand/90">
								Connect a repo for free
							</Button>
						</Link>
						<Link to="/tools/core-web-vitals">
							<Button variant="outline">Check your Core Web Vitals</Button>
						</Link>
					</div>
				</Card>

				<OtherComparisons current={c} />
			</article>
		</MarketingShell>
	);
}

function FitCard({ title, items }: { title: string; items: string[] }) {
	return (
		<Card className="p-5">
			<h2 className="font-semibold">{title}</h2>
			<ul className="mt-3 space-y-2 text-sm">
				{items.map((item) => (
					<li key={item} className="flex items-start gap-2">
						<CheckCircleIcon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
						{item}
					</li>
				))}
			</ul>
		</Card>
	);
}

function OtherComparisons({ current }: { current: Competitor }) {
	const others = COMPETITORS.filter((c) => c.slug !== current.slug);
	if (others.length === 0) return null;
	return (
		<nav aria-label="Other comparisons" className="mt-14">
			<h2 className="text-sm font-semibold">Other comparisons</h2>
			<ul className="mt-3 flex flex-wrap gap-2">
				{others.map((c) => (
					<li key={c.slug}>
						<Link
							to="/compare/$slug"
							params={{ slug: c.slug }}
							className="inline-block rounded-full border border-border px-3 py-1 text-sm text-muted-foreground hover:text-foreground"
						>
							Vitalgate vs {c.name}
						</Link>
					</li>
				))}
			</ul>
		</nav>
	);
}
