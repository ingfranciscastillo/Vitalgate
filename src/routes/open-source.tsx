import { CheckCircleIcon } from "@phosphor-icons/react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { MarketingShell } from "@/components/marketing-shell";
import { Reveal } from "@/components/reveal";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { OG_IMAGE_META, SITE_URL } from "@/lib/seo";

const DESCRIPTION =
	"Vitalgate Pro is free for open-source projects: performance budgets on every pull request, alerts and real-user metrics for public repositories.";

export const Route = createFileRoute("/open-source")({
	head: () => ({
		meta: [
			{ title: "Free Pro for open source: Vitalgate" },
			{ name: "description", content: DESCRIPTION },
			{ property: "og:type", content: "website" },
			{ property: "og:url", content: `${SITE_URL}/open-source` },
			{
				property: "og:title",
				content: "Vitalgate Pro is free for open source",
			},
			{ property: "og:description", content: DESCRIPTION },
			...OG_IMAGE_META,
			{ name: "twitter:card", content: "summary_large_image" },
		],
		links: [{ rel: "canonical", href: `${SITE_URL}/open-source` }],
	}),
	component: OpenSource,
});

const WHO = [
	"A public GitHub repository under an open-source license",
	"A website people use: docs, a demo or the project's own site",
	"Pull requests in the last three months",
	"Preview deployments (Vercel, Netlify, Render…) or a build that runs in GitHub Actions",
];

const STEPS = [
	{
		title: "Connect the repository",
		body: "Sign in with GitHub and connect it on the Free plan. The first check shows up on your next pull request.",
	},
	{
		title: "Apply",
		body: "Send the repository link through the form. Each project is reviewed by hand.",
	},
	{
		title: "Get Pro",
		body: "Your workspace moves to Pro within two working days and stays there while the project is public and active.",
	},
];

function OpenSource() {
	return (
		<MarketingShell>
			<section className="mx-auto max-w-3xl px-5 pt-20 pb-24">
				<Reveal>
					<h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
						Vitalgate Pro is free for open source
					</h1>
					<p className="mt-4 max-w-2xl text-lg text-muted-foreground">
						Open-source sites get the same regressions as everyone else, with
						fewer people watching. If your project fits, every pull request gets
						a performance check, with alerts and real-user metrics, at no cost.
					</p>
				</Reveal>

				<div className="mt-10 grid gap-4 sm:grid-cols-2">
					<Card className="p-5">
						<h2 className="font-semibold">Who it's for</h2>
						<ul className="mt-3 space-y-2 text-sm">
							{WHO.map((item) => (
								<li key={item} className="flex items-start gap-2">
									<CheckCircleIcon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
									{item}
								</li>
							))}
						</ul>
					</Card>
					<Card className="p-5">
						<h2 className="font-semibold">What you get</h2>
						<p className="mt-3 text-sm text-muted-foreground">
							Everything in Pro: unlimited repositories, alerts in Slack,
							Discord, Teams, Google Chat or a webhook, Linear and Jira issues,
							custom alert rules and the weekly digest.
						</p>
						<p className="mt-3 text-sm text-muted-foreground">
							Nothing is required in return. If it helps, the{" "}
							<span className="text-foreground">README badge</span> lets other
							maintainers find it.
						</p>
					</Card>
				</div>

				<section className="mt-12">
					<h2 className="text-xl font-bold tracking-tight">How it works</h2>
					<ol className="mt-5 space-y-5">
						{STEPS.map((step, i) => (
							<li key={step.title} className="flex gap-4">
								<span className="grid size-7 shrink-0 place-items-center rounded-full border border-border font-mono text-xs">
									{i + 1}
								</span>
								<div>
									<h3 className="font-semibold">{step.title}</h3>
									<p className="mt-1 text-sm text-muted-foreground">
										{step.body}
									</p>
								</div>
							</li>
						))}
					</ol>
					<div className="mt-8 flex flex-wrap gap-3">
						<Link to="/contact" search={{ topic: "open-source" }}>
							<Button className="bg-brand text-brand-foreground hover:bg-brand/90">
								Apply for free Pro
							</Button>
						</Link>
						<Link to="/login">
							<Button variant="outline">Connect a repo first</Button>
						</Link>
					</div>
				</section>
			</section>
		</MarketingShell>
	);
}
