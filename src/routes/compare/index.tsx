import { createFileRoute, Link } from "@tanstack/react-router";
import { MarketingShell } from "@/components/marketing-shell";
import { Reveal } from "@/components/reveal";
import { Card } from "@/components/ui/card";
import { COMPETITORS } from "@/lib/competitors";
import { OG_IMAGE_META, SITE_URL } from "@/lib/seo";

const DESCRIPTION =
	"How Vitalgate compares with Lighthouse CI, Calibre and SpeedCurve: what each does best, pricing, and which fits your team.";

export const Route = createFileRoute("/compare/")({
	head: () => ({
		meta: [
			{ title: "Compare Vitalgate: Lighthouse CI, Calibre, SpeedCurve" },
			{ name: "description", content: DESCRIPTION },
			{ property: "og:type", content: "website" },
			{ property: "og:url", content: `${SITE_URL}/compare` },
			{ property: "og:title", content: "Compare Vitalgate" },
			{ property: "og:description", content: DESCRIPTION },
			...OG_IMAGE_META,
			{ name: "twitter:card", content: "summary_large_image" },
		],
		links: [{ rel: "canonical", href: `${SITE_URL}/compare` }],
	}),
	component: CompareHub,
});

function CompareHub() {
	return (
		<MarketingShell>
			<section className="mx-auto max-w-4xl px-5 pt-20 pb-24">
				<Reveal>
					<h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
						How Vitalgate compares
					</h1>
					<p className="mt-4 max-w-2xl text-muted-foreground">
						Monitoring tools tell you a release made your site slower. Vitalgate
						fails the pull request that would have. Here's how it stacks up,
						including where the others are the better pick.
					</p>
				</Reveal>
				<ul className="mt-10 grid gap-4 sm:grid-cols-2">
					{COMPETITORS.map((c, i) => (
						<li key={c.slug}>
							<Reveal delay={i * 0.05} className="h-full">
								<Link
									to="/compare/$slug"
									params={{ slug: c.slug }}
									className="block h-full"
								>
									<Card className="h-full p-5 transition-colors hover:border-foreground/30">
										<h2 className="font-semibold">Vitalgate vs {c.name}</h2>
										<p className="mt-2 text-sm text-muted-foreground">
											{c.tagline}
										</p>
									</Card>
								</Link>
							</Reveal>
						</li>
					))}
				</ul>
			</section>
		</MarketingShell>
	);
}
