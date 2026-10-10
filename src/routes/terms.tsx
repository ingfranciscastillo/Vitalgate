import { createFileRoute, Link } from "@tanstack/react-router";
import { MarketingShell } from "@/components/marketing-shell";
import { Reveal } from "@/components/reveal";
import { LEGAL_CONTACT_EMAIL, LEGAL_OPERATOR } from "@/lib/legal";
import { OG_IMAGE_META, SITE_URL } from "@/lib/seo";

export const Route = createFileRoute("/terms")({
	head: () => ({
		meta: [
			{ title: "Terms of Service: Vitalgate" },
			{
				name: "description",
				content:
					"The terms that apply when you use Vitalgate to enforce performance budgets on your pull requests.",
			},
			{ property: "og:type", content: "website" },
			{ property: "og:url", content: `${SITE_URL}/terms` },
			{ property: "og:title", content: "Vitalgate terms of service" },
			...OG_IMAGE_META,
			{ name: "twitter:card", content: "summary_large_image" },
		],
		links: [{ rel: "canonical", href: `${SITE_URL}/terms` }],
	}),
	component: Terms,
});

const EFFECTIVE_DATE = "October 9, 2026";

function Terms() {
	return (
		<MarketingShell>
			<article className="mx-auto max-w-2xl px-5 py-20">
				<Reveal>
					<span className="text-xs uppercase tracking-wider text-primary">
						Legal
					</span>
					<h1 className="mt-2 text-3xl font-extrabold tracking-tight sm:text-4xl">
						Terms of Service
					</h1>
					<p className="mt-3 text-sm text-muted-foreground">
						Effective {EFFECTIVE_DATE}. These terms are an agreement between you
						and {LEGAL_OPERATOR}, an independent developer based in the
						Dominican Republic who builds and runs Vitalgate ("we," "us"). They
						cover your use of{" "}
						<span className="font-mono">vitalgate.vercel.app</span> and the
						GitHub workflow it adds to your repositories (the "Service").
					</p>
				</Reveal>

				<Reveal delay={0.05}>
					<div className="mt-10 max-w-none space-y-8 text-sm leading-relaxed text-muted-foreground [&_h2]:mt-0 [&_h2]:mb-2 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-foreground [&_li]:mt-1 [&_p+p]:mt-3 [&_strong]:text-foreground [&_ul]:mt-2 [&_ul]:list-disc [&_ul]:pl-5">
						<section>
							<h2>1. Accepting these terms</h2>
							<p>
								By signing in to Vitalgate you agree to these terms and to our{" "}
								<Link
									to="/privacy-policy"
									className="text-primary hover:underline"
								>
									Privacy Policy
								</Link>
								. If you don't agree, don't use the Service. You must be at
								least 16 years old. If you use Vitalgate on behalf of a company
								or other organization, you confirm you're allowed to accept
								these terms for it, and "you" includes that organization.
							</p>
						</section>

						<section>
							<h2>2. What Vitalgate does</h2>
							<p>
								Vitalgate commits a GitHub Actions workflow to the repositories
								you connect. On each pull request, that workflow builds your
								app, runs a Lighthouse audit on your own GitHub Actions runner,
								and sends the resulting metrics to Vitalgate, which compares
								them against the performance budgets you set and reports whether
								the run passed.
							</p>
							<p>
								Lighthouse results are lab measurements and vary between runs.
								Vitalgate is a tool to help you catch regressions; it doesn't
								guarantee that every regression will be caught, or that a
								passing check means your site is fast for real users.
							</p>
						</section>

						<section>
							<h2>3. Your account</h2>
							<p>
								You sign in with GitHub. You're responsible for activity under
								your account and your workspace, and for who has write access to
								the repositories you connect: their workflow runs report results
								to your workspace. If you think your account has been
								compromised, tell us at{" "}
								<a
									href={`mailto:${LEGAL_CONTACT_EMAIL}`}
									className="text-primary hover:underline"
								>
									{LEGAL_CONTACT_EMAIL}
								</a>
								.
							</p>
						</section>

						<section>
							<h2>4. Access to your GitHub repositories</h2>
							<p>
								Vitalgate gets access to your repositories through the Vitalgate
								GitHub App, only on the repositories you choose when installing
								it. We use that access only to run the Service: listing the
								repositories you granted, reading files needed to configure the
								workflow (such as{" "}
								<span className="font-mono">package.json</span> and lockfiles),
								creating, updating, or removing the Vitalgate workflow file, and
								commenting results on pull requests.
							</p>
							<p>
								<strong>
									The workflow runs on your GitHub Actions minutes, under your
									GitHub account's terms and billing.
								</strong>{" "}
								You're responsible for reviewing the workflow before merging
								code that depends on it, and for any repository secrets you
								choose to expose to it. You can revoke Vitalgate's access at any
								time by uninstalling the app or changing its repositories in
								your GitHub settings.
							</p>
						</section>

						<section>
							<h2>5. Acceptable use</h2>
							<p>You agree not to:</p>
							<ul>
								<li>
									Use the Service for anything illegal, or to harm, probe, or
									attack Vitalgate or anyone else's systems.
								</li>
								<li>
									Submit data to the ingest API that didn't come from a real
									audit of a repository you're allowed to use, or flood it with
									requests.
								</li>
								<li>
									Try to access another workspace's data, bypass plan limits, or
									get around security measures.
								</li>
								<li>
									Resell or provide the Service to third parties as your own
									product without our written permission.
								</li>
							</ul>
						</section>

						<section>
							<h2>6. Your data</h2>
							<p>
								Your code, your repositories, and the data your workspace sends
								to Vitalgate (metrics, pull request titles, budgets, and
								similar) stay yours. You give us permission to store and process
								that data only as needed to provide the Service to you. We don't
								sell it. How we handle personal data is described in the{" "}
								<Link
									to="/privacy-policy"
									className="text-primary hover:underline"
								>
									Privacy Policy
								</Link>
								.
							</p>
							<p>
								You can ask us for a copy of your workspace data, or for it to
								be deleted, by emailing{" "}
								<a
									href={`mailto:${LEGAL_CONTACT_EMAIL}`}
									className="text-primary hover:underline"
								>
									{LEGAL_CONTACT_EMAIL}
								</a>
								.
							</p>
						</section>

						<section>
							<h2>7. Our software</h2>
							<p>
								Vitalgate, its name, logo, and the software behind it belong to
								us. We give you a limited, non-exclusive, non-transferable right
								to use the Service under these terms. The workflow file we
								commit to your repository is yours to keep, edit, or delete.
							</p>
						</section>

						<section>
							<h2>8. Plans and pricing</h2>
							<p>
								Vitalgate has a Free plan and a Pro plan, with the limits shown
								on the{" "}
								<Link to="/pricing" className="text-primary hover:underline">
									pricing page
								</Link>
								. Online payment isn't available yet. Before we charge anything,
								we'll show you the price, billing period, renewal, and refund
								terms, and you'll have to accept them explicitly — nothing is
								billed automatically under these terms.
							</p>
							<p>
								We may change what each plan includes. If a change reduces what
								your current plan includes, we'll tell you at least 30 days in
								advance.
							</p>
						</section>

						<section>
							<h2>9. Third-party services</h2>
							<p>
								The Service depends on GitHub, and optionally connects to Slack
								and Discord. Your use of those services is governed by their own
								terms, and we're not responsible for their availability or for
								what they do with data you send them.
							</p>
						</section>

						<section>
							<h2>10. Availability</h2>
							<p>
								Vitalgate is run by an independent developer and is provided
								without an uptime guarantee or service level agreement. We may
								need to interrupt the Service for maintenance, and we may change
								or discontinue features. If we decide to shut the Service down,
								we'll give at least 30 days' notice so you can export your data
								and remove the workflow.
							</p>
						</section>

						<section>
							<h2>11. Disclaimer</h2>
							<p>
								<strong>
									The Service is provided "as is" and "as available."
								</strong>{" "}
								To the extent the law allows, we disclaim all warranties,
								express or implied, including merchantability, fitness for a
								particular purpose, and non-infringement.
							</p>
						</section>

						<section>
							<h2>12. Limitation of liability</h2>
							<p>
								<strong>
									To the extent the law allows, we aren't liable for indirect,
									incidental, special, or consequential damages, or for lost
									profits, revenue, or data, arising from your use of the
									Service. Our total liability for any claim is limited to the
									greater of the amount you paid us in the 12 months before the
									claim or US$50.
								</strong>
							</p>
							<p>
								Nothing in these terms limits liability that can't be limited by
								law, such as liability for fraud or gross negligence, or rights
								you have as a consumer under the mandatory law of the country
								where you live.
							</p>
						</section>

						<section>
							<h2>13. Your responsibility</h2>
							<p>
								If someone brings a claim against us because of how you used the
								Service in breach of these terms or the law, you agree to cover
								the reasonable costs that result, to the extent the law allows.
							</p>
						</section>

						<section>
							<h2>14. Ending your use</h2>
							<p>
								You can stop using Vitalgate at any time: disconnect your
								repositories (which removes the workflow file and deletes their
								data), revoke access from GitHub, and ask us to delete your
								account. We may suspend or close an account that seriously or
								repeatedly breaks these terms; when we can, we'll tell you
								first. Sections 6, 7, and 11 to 16 continue to apply after your
								use ends.
							</p>
						</section>

						<section>
							<h2>15. Governing law</h2>
							<p>
								These terms are governed by the laws of the Dominican Republic,
								and disputes will be handled by its courts, unless the mandatory
								law of the country where you live as a consumer gives you the
								right to bring a claim there. Before going to court, please
								email us — most problems can be solved that way.
							</p>
						</section>

						<section>
							<h2>16. Changes to these terms</h2>
							<p>
								If we make a material change to these terms, we'll update the
								effective date and notify you by email or in the app at least 30
								days before it applies. If you don't agree with the change, you
								can stop using the Service before it takes effect.
							</p>
						</section>

						<section>
							<h2>17. Other</h2>
							<p>
								If a part of these terms turns out to be unenforceable, the rest
								still applies. Not enforcing a part of these terms isn't a
								waiver of it. These terms and the Privacy Policy are the whole
								agreement between you and us about the Service. You can't
								transfer these terms to someone else without our consent; we can
								transfer them if the Service changes hands, and we'll tell you
								if that happens.
							</p>
						</section>

						<section>
							<h2>18. Contact</h2>
							<p>
								Questions about these terms? Email{" "}
								<a
									href={`mailto:${LEGAL_CONTACT_EMAIL}`}
									className="text-primary hover:underline"
								>
									{LEGAL_CONTACT_EMAIL}
								</a>{" "}
								or use the{" "}
								<Link to="/contact" className="text-primary hover:underline">
									contact form
								</Link>
								.
							</p>
						</section>
					</div>
				</Reveal>
			</article>
		</MarketingShell>
	);
}
