import { CheckCircleIcon } from "@phosphor-icons/react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { motion, useReducedMotion } from "motion/react";
import { MarketingShell } from "@/components/marketing-shell";
import { Reveal } from "@/components/reveal";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { staggerContainer, staggerItem } from "@/lib/motion";
import { OG_IMAGE_META, SITE_URL } from "@/lib/seo";

export const Route = createFileRoute("/pricing")({
	head: () => ({
		meta: [
			{ title: "Pricing: Vitalgate" },
			{
				name: "description",
				content:
					"Free for one repository. $29/mo for unlimited repos, Slack and Discord alerts, and a weekly digest.",
			},
			{ property: "og:type", content: "website" },
			{ property: "og:url", content: `${SITE_URL}/pricing` },
			{ property: "og:title", content: "Vitalgate pricing" },
			{
				property: "og:description",
				content: "Free and Pro plans for performance budget tracking.",
			},
			...OG_IMAGE_META,
			{ name: "twitter:card", content: "summary_large_image" },
		],
		links: [{ rel: "canonical", href: `${SITE_URL}/pricing` }],
	}),
	component: Pricing,
});

const plans = [
	{
		name: "Free",
		price: "$0",
		desc: "Try Vitalgate on your main repo, for as long as you want.",
		features: [
			"1 connected repository",
			"Unlimited pull requests audited",
			"Performance budgets (LCP, CLS, FCP, TBT, score)",
			"PR comments + a failing check on broken budgets",
			"Email alerts",
			"Unlimited team members",
		],
	},
	{
		name: "Pro",
		price: "$29",
		popular: true,
		desc: "For teams protecting more than one repo.",
		features: [
			"Unlimited repositories",
			"Everything in Free",
			"Slack + Discord alert delivery",
			"Custom alert rules (regressions, score thresholds)",
			"Weekly performance digest email",
			"Email support",
		],
	},
];

function Pricing() {
	const reduce = useReducedMotion();

	return (
		<MarketingShell>
			<Reveal>
				<section className="mx-auto max-w-6xl px-5 pt-20 pb-12 text-center">
					<span className="text-xs uppercase tracking-wider text-primary">
						Pricing
					</span>
					<h1 className="mt-2 text-4xl sm:text-5xl font-extrabold tracking-tight">
						Built for teams that ship.
					</h1>
					<p className="mt-4 text-muted-foreground max-w-xl mx-auto">
						Free for your first repo. $29/mo once you need more than one — no
						per-seat charges, no sales call required.
					</p>
				</section>
			</Reveal>
			<section className="mx-auto max-w-3xl px-5 pb-24">
				<div className="grid sm:grid-cols-2 gap-4">
					{plans.map((p, i) => (
						<Reveal key={p.name} delay={i * 0.08}>
							<Card
								className={`p-7 transition-colors duration-200 ${p.popular ? "border-brand" : "hover:border-foreground/30"}`}
							>
								<div className="flex items-center justify-between">
									<h2 className="font-bold">{p.name}</h2>
									{p.popular && (
										<span className="border border-brand px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-brand">
											Most popular
										</span>
									)}
								</div>
								<div className="mt-3 flex items-baseline gap-1">
									<span className="font-mono text-4xl font-semibold">
										{p.price}
									</span>
									<span className="text-sm text-muted-foreground">/mo</span>
								</div>
								<p className="mt-2 text-sm text-muted-foreground">{p.desc}</p>
								<Link to="/login" className="block mt-5">
									<Button
										className={`w-full ${p.popular ? "bg-brand text-brand-foreground hover:bg-brand/90" : ""}`}
										variant={p.popular ? "default" : "outline"}
									>
										{p.popular ? "Upgrade to Pro" : "Start free"}
									</Button>
								</Link>
								<motion.ul
									className="mt-6 space-y-2 text-sm"
									variants={staggerContainer}
									initial="hidden"
									whileInView="show"
									viewport={{ once: true, amount: 0.4 }}
								>
									{p.features.map((f) => (
										<motion.li
											key={f}
											variants={staggerItem(reduce)}
											className="flex items-start gap-2"
										>
											<CheckCircleIcon className="h-4 w-4 text-primary mt-0.5 shrink-0" />{" "}
											{f}
										</motion.li>
									))}
								</motion.ul>
							</Card>
						</Reveal>
					))}
				</div>
			</section>
		</MarketingShell>
	);
}
