import {
	ArrowRightIcon,
	BellIcon,
	CheckCircleIcon,
	FlowArrowIcon,
	GaugeIcon,
	GitBranchIcon,
	LightningIcon,
	ShieldCheckIcon,
	StackIcon,
	XCircleIcon,
} from "@phosphor-icons/react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { animate, motion, useInView, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { MarketingShell } from "@/components/marketing-shell";
import { PrCommentPreview } from "@/components/pr-comment-preview";
import { PrFlowDemo } from "@/components/pr-flow-demo";
import { Reveal } from "@/components/reveal";
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getPublicPricing } from "@/lib/billing.functions";
import { CWV_SNAPSHOT } from "@/lib/cwv-snapshot";
import { EASE_OUT, staggerContainer, staggerItem } from "@/lib/motion";
import { OG_IMAGE_META, SITE_URL } from "@/lib/seo";

export const Route = createFileRoute("/")({
	loader: () => getPublicPricing(),
	head: () => ({
		meta: [
			{ title: "Vitalgate: Performance Budgets for every Pull Request" },
			{
				name: "description",
				content:
					"Ship faster without shipping regressions. Vitalgate runs Lighthouse on every PR, checks it against your performance budgets, and fails the PR check when a change breaks them.",
			},
			{ property: "og:type", content: "website" },
			{ property: "og:url", content: SITE_URL },
			{
				property: "og:title",
				content: "Vitalgate: Performance Budgets for every PR",
			},
			{
				property: "og:description",
				content:
					"Catch web performance regressions before they reach production.",
			},
			...OG_IMAGE_META,
			{ name: "twitter:card", content: "summary_large_image" },
			{
				"script:ld+json": {
					"@context": "https://schema.org",
					"@type": "SoftwareApplication",
					name: "Vitalgate",
					url: SITE_URL,
					applicationCategory: "DeveloperApplication",
					operatingSystem: "Web",
					description:
						"Enforces web performance budgets on every GitHub pull request, failing the PR check when LCP, CLS, FCP, TBT or the Lighthouse score regress.",
					offers: {
						"@type": "Offer",
						price: "0",
						priceCurrency: "USD",
						description: "Free for one repository.",
					},
				},
			},
		],
		links: [{ rel: "canonical", href: SITE_URL }],
	}),
	component: Landing,
});

function Landing() {
	return (
		<MarketingShell>
			<Hero />
			<ProofStrip />
			<Flow />
			<Features />
			<DashboardPreview />
			<PricingPreview />
			<FounderNote />
			<Faq />
			<FinalCta />
		</MarketingShell>
	);
}

function Hero() {
	const reduce = useReducedMotion();
	const item = staggerItem(reduce);

	return (
		<section className="border-b border-border">
			<div className="mx-auto grid max-w-6xl items-center gap-12 px-5 pb-20 pt-20 lg:grid-cols-[1.05fr_1fr] lg:gap-10 lg:pt-24">
				<motion.div initial="hidden" animate="show" variants={staggerContainer}>
					<motion.h1
						variants={item}
						className="text-4xl font-black leading-[1.05] tracking-tighter sm:text-5xl lg:text-6xl"
					>
						Stop shipping performance{" "}
						<span className="text-brand">regressions.</span>
					</motion.h1>
					<motion.p
						variants={item}
						className="mt-5 max-w-md text-base leading-relaxed text-muted-foreground sm:text-lg"
					>
						Vitalgate runs Lighthouse on every pull request, compares it against
						your baseline, and fails the PR check when a change breaks your
						budgets.
					</motion.p>
					<motion.div
						variants={item}
						className="mt-8 flex flex-wrap items-center gap-3"
					>
						<Link to="/login">
							<Button
								size="lg"
								className="bg-brand text-brand-foreground hover:bg-brand/90"
							>
								Connect a repo
								<ArrowRightIcon className="ml-1 h-4 w-4 transition-transform duration-150 ease-out group-hover:translate-x-1" />
							</Button>
						</Link>
						<Link to="/tools/core-web-vitals">
							<Button size="lg" variant="outline">
								Check your site's Core Web Vitals
							</Button>
						</Link>
					</motion.div>
					<motion.p
						variants={item}
						className="mt-4 text-xs text-muted-foreground"
					>
						Free for one repository · No credit card · 14-day refund on Pro
					</motion.p>
				</motion.div>

				<Reveal delay={0.1}>
					<PrFlowDemo />
				</Reveal>
			</div>
		</section>
	);
}

/**
 * Real field data, not testimonials: how popular developer tools do on
 * Core Web Vitals, with a way to check your own site.
 */
function ProofStrip() {
	const failed = CWV_SNAPSHOT.sites.filter((s) => !s.passed).length;
	return (
		<section className="border-b border-border bg-muted/30">
			<div className="mx-auto flex max-w-6xl flex-col gap-4 px-5 py-8 lg:flex-row lg:items-center lg:gap-10">
				<div className="lg:max-w-xs">
					<p className="text-lg font-bold tracking-tight">
						{failed} of {CWV_SNAPSHOT.sites.length} developer tools fail Core
						Web Vitals.
					</p>
					<p className="mt-1 text-xs text-muted-foreground">
						Real Chrome users, 75th percentile, {CWV_SNAPSHOT.period}. Source:
						Chrome UX Report.
					</p>
				</div>
				<ul className="flex flex-1 flex-wrap gap-x-5 gap-y-2 text-sm">
					{CWV_SNAPSHOT.sites.map((site) => (
						<li key={site.name} className="flex items-center gap-1.5">
							{site.passed ? (
								<CheckCircleIcon
									className="size-4 text-success"
									weight="fill"
									aria-label="Passes"
								/>
							) : (
								<XCircleIcon
									className="size-4 text-destructive"
									weight="fill"
									aria-label="Fails"
								/>
							)}
							<span className={site.passed ? "" : "text-muted-foreground"}>
								{site.name}
							</span>
						</li>
					))}
				</ul>
				<Link
					to="/tools/core-web-vitals"
					className="text-sm font-medium text-primary hover:underline"
				>
					Check your site
				</Link>
			</div>
		</section>
	);
}

function Flow() {
	const steps = [
		{
			icon: GitBranchIcon,
			title: "Connect",
			body: "Install the GitHub App and pick the repos to monitor, with granular permissions per repo.",
		},
		{
			icon: GaugeIcon,
			title: "Budget",
			body: "Pick a preset — default, strict or relaxed — for LCP, CLS, FCP, TBT and the performance score. Each metric is either required or a warning.",
		},
		{
			icon: ShieldCheckIcon,
			title: "Enforce",
			body: "Every PR runs Lighthouse, compares against your baseline, posts the results on the PR, and fails the check when a required budget is broken.",
		},
	];
	return (
		<section id="how" className="mx-auto max-w-6xl px-5 py-24">
			<Reveal>
				<span className="text-xs uppercase tracking-wider text-primary">
					How it works
				</span>
				<h2 className="mt-2 max-w-lg text-3xl font-extrabold tracking-tight sm:text-4xl">
					From pull request to production, with guardrails.
				</h2>
			</Reveal>
			<div className="mt-14 grid gap-10 border-t border-border pt-10 md:grid-cols-3 md:gap-8">
				{steps.map((s, i) => (
					<Reveal key={s.title} delay={i * 0.08}>
						<div className="flex items-baseline gap-3">
							<span className="font-mono text-sm text-muted-foreground">
								0{i + 1}
							</span>
							<s.icon className="size-4 text-brand" weight="bold" />
							<h3 className="text-lg font-bold">{s.title}</h3>
						</div>
						<p className="mt-3 text-sm leading-relaxed text-muted-foreground">
							{s.body}
						</p>
					</Reveal>
				))}
			</div>
		</section>
	);
}

function Features() {
	const groupedFeatures = [
		{
			icon: BellIcon,
			title: "Smart alerts",
			body: "Email, Slack, Discord, Teams, Google Chat and webhook alerts on threshold breaches.",
		},
		{
			icon: ShieldCheckIcon,
			title: "Required checks",
			body: "Mark the Vitalgate check as required and a broken budget can't be merged.",
		},
		{
			icon: StackIcon,
			title: "Runs on your runner",
			body: "Audits run in your own GitHub Actions. Only the metrics come back.",
		},
		{
			icon: FlowArrowIcon,
			title: "Multi-tenant orgs",
			body: "Invite your team as admins or view-only members, per workspace.",
		},
	];
	return (
		<section id="features" className="border-y border-border">
			<div className="mx-auto max-w-6xl px-5 py-24">
				<Reveal>
					<h2 className="max-w-xl text-3xl font-extrabold tracking-tight sm:text-4xl">
						Performance engineering, in your existing GitHub flow.
					</h2>
				</Reveal>
				<div className="mt-12 grid gap-4">
					<Reveal>
						<div className="grid gap-6 border border-border p-6 transition-colors duration-200 hover:border-foreground/25 lg:grid-cols-[1fr_1.7fr] lg:items-center lg:gap-10">
							<div>
								<h3 className="font-bold">Results on the pull request</h3>
								<p className="mt-1.5 max-w-sm text-sm leading-relaxed text-muted-foreground">
									Every metric against its budget and your baseline, in a
									comment updated on each push, plus a "Vitalgate" check you can
									make required so a broken budget can't be merged.
								</p>
							</div>
							<PrCommentPreview />
						</div>
					</Reveal>
					<Reveal delay={0.06}>
						<div className="grid gap-6 border border-border p-6 transition-colors duration-200 hover:border-foreground/25 lg:grid-cols-[1fr_1.7fr] lg:items-center lg:gap-10">
							<div>
								<h3 className="font-bold">Lighthouse on every pull request</h3>
								<p className="mt-1.5 max-w-sm text-sm leading-relaxed text-muted-foreground">
									Three Lighthouse runs on every push, on your own GitHub
									Actions runner or against your preview deployment. The median
									run counts, so one noisy run can't fail a PR.
								</p>
							</div>
							<div className="border border-border bg-card">
								<div className="border-b border-border px-3 py-2 font-mono text-[11px] text-muted-foreground">
									Budgets · acme/storefront
								</div>
								<pre className="overflow-x-auto px-3 py-3 font-mono text-[12px] leading-relaxed">
									<span className="text-muted-foreground">LCP:</span>
									{"  "}max: 2500ms severity:{" "}
									<span className="text-destructive">fail</span>
									{"\n"}
									<span className="text-muted-foreground">FCP:</span>
									{"  "}max: 1800ms severity:{" "}
									<span className="text-warning">warn</span>
									{"\n"}
									<span className="text-muted-foreground">CLS:</span>
									{"  "}max: 0.10{"   "}severity:{" "}
									<span className="text-warning">warn</span>
									{"\n"}
									<span className="text-muted-foreground">PERF:</span> min: 90
									{"    "}severity:{" "}
									<span className="text-destructive">fail</span>
								</pre>
							</div>
						</div>
					</Reveal>
				</div>
				<Reveal delay={0.1}>
					<div className="mt-4 grid divide-y divide-border border border-border sm:grid-cols-2 sm:divide-x sm:divide-y-0">
						{groupedFeatures.map((f) => (
							<div
								key={f.title}
								className="flex items-start gap-3 p-6 transition-colors duration-200 hover:bg-muted/40"
							>
								<f.icon className="mt-0.5 size-4 shrink-0 text-primary" />
								<div>
									<h3 className="font-bold">{f.title}</h3>
									<p className="mt-1 text-sm leading-relaxed text-muted-foreground">
										{f.body}
									</p>
								</div>
							</div>
						))}
					</div>
				</Reveal>
			</div>
		</section>
	);
}

function AnimatedNumber({ value }: { value: number }) {
	const ref = useRef<HTMLSpanElement>(null);
	const inView = useInView(ref, { once: true, amount: 0.6 });
	const reduce = useReducedMotion();
	const [display, setDisplay] = useState(reduce ? value : 0);

	useEffect(() => {
		if (!inView) return;
		if (reduce) {
			setDisplay(value);
			return;
		}
		const controls = animate(0, value, {
			duration: 0.8,
			ease: EASE_OUT,
			onUpdate: (v) => setDisplay(Math.round(v)),
		});
		return () => controls.stop();
	}, [inView, reduce, value]);

	return <span ref={ref}>{display}</span>;
}

function DashboardPreview() {
	const reduce = useReducedMotion();
	const points = [
		{ pct: 30 },
		{ pct: 42 },
		{ pct: 55 },
		{ pct: 48 },
		{ pct: 60 },
		{ pct: 72 },
		{ pct: 65 },
		{ pct: 78 },
		{ pct: 82 },
		{ pct: 70 },
		{ pct: 58 },
		{ pct: 44 },
		{ pct: 52 },
		{ pct: 66 },
		{ pct: 74 },
		{ pct: 80 },
		{ pct: 88 },
		{ pct: 76 },
		{ pct: 62 },
		{ pct: 50 },
		{ pct: 40 },
		{ pct: 54 },
		{ pct: 68 },
		{ pct: 79 },
		{ pct: 85 },
		{ pct: 90 },
		{ pct: 84 },
		{ pct: 72 },
		{ pct: 60 },
		{ pct: 92 },
	];
	return (
		<section className="mx-auto max-w-6xl px-5 py-24">
			<div className="grid items-center gap-12 lg:grid-cols-2">
				<Reveal>
					<h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
						One dashboard for every repo, every metric, every regression.
					</h2>
					<p className="mt-4 leading-relaxed text-muted-foreground">
						See exactly which repos are healthy and which PRs broke something,
						without digging through CI logs.
					</p>
					<ul className="mt-6 space-y-2 text-sm">
						{[
							"Workspace-wide performance score, updated on every PR",
							"Per-repo health score and failing-budget count",
							"Every PR checked against your budgets, pass or fail",
							"Alerts to email, Slack, Discord, Teams or Google Chat when something breaks",
						].map((t) => (
							<li key={t} className="flex items-center gap-2">
								<CheckCircleIcon className="h-4 w-4 text-primary" /> {t}
							</li>
						))}
					</ul>
					<div className="mt-8 flex gap-3">
						<Link to="/login">
							<Button className="bg-brand text-brand-foreground hover:bg-brand/90">
								Connect a repo
								<ArrowRightIcon className="ml-1 h-4 w-4 transition-transform duration-150 ease-out group-hover:translate-x-1" />
							</Button>
						</Link>
						<Link to="/pricing">
							<Button variant="outline">See pricing</Button>
						</Link>
					</div>
				</Reveal>
				<Reveal delay={0.1}>
					<div className="border border-border p-6">
						<div className="flex items-center justify-between">
							<div>
								<div className="text-xs text-muted-foreground">
									acme/storefront, last 30 days
								</div>
								<div className="mt-1 font-mono text-3xl font-semibold">
									<AnimatedNumber value={92} />
									<span className="text-base text-muted-foreground">/100</span>
								</div>
							</div>
							<LightningIcon className="h-5 w-5 text-brand" weight="light" />
						</div>
						<div className="mt-6 flex h-40 items-end gap-1">
							{points.map((p, i) => (
								<motion.div
									// biome-ignore lint/suspicious/noArrayIndexKey: static mock series, never reordered
									key={i}
									initial={reduce ? false : { scaleY: 0 }}
									whileInView={{ scaleY: 1 }}
									viewport={{ once: true, amount: 0.6 }}
									transition={{
										duration: 0.4,
										delay: Math.min(i * 0.012, 0.3),
										ease: EASE_OUT,
									}}
									style={{ height: `${p.pct}%`, transformOrigin: "bottom" }}
									className={`flex-1 ${p.pct < 50 ? "bg-destructive/60" : "bg-success/70"}`}
								/>
							))}
						</div>
						<div className="mt-3 flex justify-between font-mono text-[10px] text-muted-foreground">
							<span>30d ago</span>
							<span>today</span>
						</div>
					</div>
				</Reveal>
			</div>
		</section>
	);
}

function PricingPreview() {
	const { founder } = Route.useLoaderData();
	const plans = [
		{
			name: "Free",
			price: "$0",
			desc: "Try it on your main repo.",
			features: [
				"1 connected repository",
				"Unlimited PRs audited",
				"Core Web Vitals budgets",
				"Email alerts",
			],
		},
		{
			name: "Pro",
			price: "$29",
			popular: true,
			desc: "For teams protecting more than one repo.",
			features: [
				"Unlimited repositories",
				"Slack, Discord, Teams, Google Chat + webhook alerts",
				"Custom alert rules",
				"Weekly digest email",
			],
		},
	];
	return (
		<section className="border-y border-border">
			<div className="mx-auto max-w-6xl px-5 py-24">
				<Reveal>
					<span className="text-xs uppercase tracking-wider text-primary">
						Pricing
					</span>
					<h2 className="mt-2 text-3xl font-extrabold tracking-tight sm:text-4xl">
						Simple plans that scale with your repos.
					</h2>
				</Reveal>
				{/* From sm up the cards share three subgrid rows (header, button,
				    features), so a taller Pro header pushes Free's to the same
				    height and both buttons and lists line up. */}
				<div className="mx-auto mt-12 grid max-w-2xl gap-4 sm:grid-cols-2 sm:gap-y-0">
					{plans.map((p, i) => (
						<Reveal
							key={p.name}
							delay={i * 0.06}
							className="sm:row-span-3 sm:grid sm:grid-rows-subgrid"
						>
							<Card
								className={`rounded-md p-7 transition-colors duration-200 gap-0 sm:row-span-3 sm:grid sm:grid-rows-subgrid ${
									p.popular ? "border-brand" : "hover:border-foreground/30"
								}`}
							>
								<div>
									<div className="flex items-center justify-between">
										<h3 className="font-bold">{p.name}</h3>
										{p.popular && (
											<span className="border border-brand px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-brand">
												Recommended
											</span>
										)}
									</div>
									<div className="mt-3 flex items-baseline gap-1">
										<span className="font-mono text-4xl font-semibold">
											{p.popular && founder ? `$${founder.price}` : p.price}
										</span>
										<span className="text-sm text-muted-foreground">/mo</span>
										{p.popular && founder && (
											<span className="ml-2 font-mono text-sm text-muted-foreground line-through">
												{p.price}
											</span>
										)}
									</div>
									{p.popular && founder && (
										<p className="mt-2 text-xs font-medium text-brand">
											Founding price, kept while you stay subscribed.{" "}
											{founder.remaining} of {founder.total} left.
										</p>
									)}
									<p className="mt-2 text-sm text-muted-foreground">{p.desc}</p>
								</div>
								<Link to="/login" className="mt-5 block">
									<Button
										className={`w-full ${p.popular ? "bg-brand text-brand-foreground hover:bg-brand/90" : ""}`}
										variant={p.popular ? "default" : "outline"}
									>
										{p.popular ? "Upgrade to Pro" : "Start free"}
									</Button>
								</Link>
								<ul className="mt-6 space-y-2 text-sm">
									{p.features.map((f) => (
										<li key={f} className="flex items-start gap-2">
											<CheckCircleIcon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />{" "}
											{f}
										</li>
									))}
								</ul>
							</Card>
						</Reveal>
					))}
				</div>
				<p className="mx-auto mt-6 max-w-2xl text-center text-sm text-muted-foreground">
					Not for you? Ask within 14 days of your first Pro payment for a full
					refund.{" "}
					<Link to="/pricing" className="text-primary hover:underline">
						See all plans
					</Link>
				</p>
			</div>
		</section>
	);
}

/** A real person behind a new product, and an honest "when it isn't for you". */
function FounderNote() {
	return (
		<section className="mx-auto max-w-3xl px-5 pt-24">
			<Reveal>
				<div className="flex flex-col gap-5 border border-border p-6 sm:flex-row sm:items-start">
					<img
						src="https://github.com/ingfranciscastillo.png?size=96"
						alt="Francis Castillo"
						width={48}
						height={48}
						loading="lazy"
						decoding="async"
						className="size-12 shrink-0 rounded-full border border-border"
					/>
					<div>
						<h2 className="font-bold">Built by one developer, in the open</h2>
						<p className="mt-2 text-sm leading-relaxed text-muted-foreground">
							I'm Francis, a developer from the Dominican Republic, and I build
							Vitalgate on my own. If it doesn't work with your setup, write to
							me through the{" "}
							<Link to="/contact" className="text-primary hover:underline">
								contact form
							</Link>
							: I read and answer every message.
						</p>
						<p className="mt-3 text-sm leading-relaxed text-muted-foreground">
							Not the right fit if you need production monitoring around the
							clock from many locations: Vitalgate checks pull requests, before
							they ship.{" "}
							<Link to="/compare" className="text-primary hover:underline">
								See how it compares
							</Link>
							.
						</p>
					</div>
				</div>
			</Reveal>
		</section>
	);
}

function Faq() {
	const items = [
		{
			q: "How long does setup take?",
			a: "About 5 minutes. Install the Vitalgate GitHub App, pick your repos, and accept the default budgets.",
		},
		{
			q: "Where do the Lighthouse runs happen?",
			a: "On your own GitHub Actions runner. Vitalgate never builds or hosts your app: it only reads the files it needs to set up the workflow (like package.json), and the workflow sends the results back with a token GitHub signs for that repository, so there's no Vitalgate secret to set up.",
		},
		{
			q: "Can I have different budgets per route?",
			a: "Not yet — budgets today apply per repository, checked on every PR for LCP, CLS, FCP, TBT and the overall score. Per-route budgets are on the roadmap.",
		},
		{
			q: "What happens when a PR fails a budget?",
			a: 'If a required budget fails, the "Vitalgate" check on the pull request fails, with the results in its summary. Make that check required in your branch protection rules and the PR can\'t be merged. Warnings pass the check and show up in its summary and the PR comment.',
		},
	];
	return (
		<section id="faq" className="mx-auto max-w-3xl px-5 py-24">
			<Reveal className="text-center">
				<h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
					Frequently asked questions
				</h2>
			</Reveal>
			<Reveal delay={0.08}>
				<Accordion type="single" collapsible className="mt-10">
					{items.map((it) => (
						<AccordionItem key={it.q} value={it.q}>
							<AccordionTrigger className="text-left">{it.q}</AccordionTrigger>
							<AccordionContent className="text-muted-foreground">
								{it.a}
							</AccordionContent>
						</AccordionItem>
					))}
				</Accordion>
			</Reveal>
		</section>
	);
}

function FinalCta() {
	return (
		<section className="mx-auto max-w-6xl px-5 pb-24">
			<Reveal>
				<div className="border border-border p-10 text-center md:p-14">
					<div className="mx-auto h-1 w-10 bg-brand" />
					<h2 className="mt-6 text-3xl font-extrabold tracking-tight sm:text-4xl">
						Your next PR shouldn't slow your site down.
					</h2>
					<p className="mx-auto mt-3 max-w-md text-muted-foreground">
						Install Vitalgate in 5 minutes. Free for your first repo, no credit
						card.
					</p>
					<div className="mt-7 flex flex-wrap justify-center gap-3">
						<Link to="/login">
							<Button
								size="lg"
								className="bg-brand text-brand-foreground hover:bg-brand/90"
							>
								Connect a repo
								<ArrowRightIcon className="ml-1 h-4 w-4 transition-transform duration-150 ease-out group-hover:translate-x-1" />
							</Button>
						</Link>
						<Link to="/pricing">
							<Button size="lg" variant="outline">
								See pricing
							</Button>
						</Link>
					</div>
				</div>
			</Reveal>
		</section>
	);
}
