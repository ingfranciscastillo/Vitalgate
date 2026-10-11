import { createFileRoute, Link } from "@tanstack/react-router";
import { MarketingShell } from "@/components/marketing-shell";
import { Reveal } from "@/components/reveal";
import { LEGAL_CONTACT_EMAIL, LEGAL_OPERATOR } from "@/lib/legal";
import { OG_IMAGE_META, SITE_URL } from "@/lib/seo";

export const Route = createFileRoute("/privacy-policy")({
	head: () => ({
		meta: [
			{ title: "Privacy Policy: Vitalgate" },
			{
				name: "description",
				content: "What Vitalgate collects, why, and how to reach us about it.",
			},
			{ property: "og:type", content: "website" },
			{ property: "og:url", content: `${SITE_URL}/privacy-policy` },
			{ property: "og:title", content: "Vitalgate privacy policy" },
			...OG_IMAGE_META,
			{ name: "twitter:card", content: "summary_large_image" },
		],
		links: [{ rel: "canonical", href: `${SITE_URL}/privacy-policy` }],
	}),
	component: PrivacyPolicy,
});

const EFFECTIVE_DATE = "October 10, 2026";

function ContactEmail() {
	return (
		<a
			href={`mailto:${LEGAL_CONTACT_EMAIL}`}
			className="text-primary hover:underline"
		>
			{LEGAL_CONTACT_EMAIL}
		</a>
	);
}

function PrivacyPolicy() {
	return (
		<MarketingShell>
			<article className="mx-auto max-w-2xl px-5 py-20">
				<Reveal>
					<span className="text-xs uppercase tracking-wider text-primary">
						Legal
					</span>
					<h1 className="mt-2 text-3xl font-extrabold tracking-tight sm:text-4xl">
						Privacy Policy
					</h1>
					<p className="mt-3 text-sm text-muted-foreground">
						Effective {EFFECTIVE_DATE}. This describes what Vitalgate actually
						collects when you use{" "}
						<span className="font-mono">vitalgate.vercel.app</span>, not a
						generic template — if we don't do something below, we don't do it.
					</p>
				</Reveal>

				<Reveal delay={0.05}>
					<div className="mt-10 max-w-none space-y-8 text-sm leading-relaxed text-muted-foreground [&_h2]:mt-0 [&_h2]:mb-2 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-foreground [&_li]:mt-1 [&_p+p]:mt-3 [&_strong]:text-foreground [&_ul]:mt-2 [&_ul]:list-disc [&_ul]:pl-5">
						<section>
							<h2>1. Who we are</h2>
							<p>
								Vitalgate is built and run by {LEGAL_OPERATOR}, an independent
								developer based in the Dominican Republic ("we," "us"). We are
								responsible for the personal data described here. Reach us at{" "}
								<ContactEmail />.
							</p>
						</section>

						<section>
							<h2>2. What we collect</h2>
							<p>
								<strong>Account info.</strong> When you sign in with GitHub, we
								receive and store your name, email address, and avatar URL from
								GitHub. We never see your GitHub password.
							</p>
							<p>
								<strong>GitHub access.</strong> Signing in gives Vitalgate an
								OAuth token limited to your GitHub profile, email, and
								organization memberships; we use it only to confirm who you are
								and, when you link a GitHub organization, that you're one of its
								owners. Access to repositories comes separately from the
								Vitalgate GitHub App, only on the repositories you choose when
								installing it, and is used to read the files needed to set up
								the workflow, add or update that workflow, and comment results
								on pull requests. You can revoke either at any time from your
								GitHub settings.
							</p>
							<p>
								<strong>Workspace and team data.</strong> Your workspace name
								and slug, its members and their roles, and pending invitations
								(the invited email address and role).
							</p>
							<p>
								<strong>Repository settings.</strong> For each repository you
								connect: its name, default branch, whether it's private, the
								performance budgets you set, and the <em>names</em> (never the
								values) of any repository secrets you choose to forward to the
								audit. We don't copy or store your source code.
							</p>
							<p>
								<strong>Performance data.</strong> The Lighthouse metrics (such
								as LCP, CLS, and the performance score) your workflow reports
								for each pull request, along with the pull request's number,
								title, author's GitHub username, and branch name, and the alerts
								generated from them.
							</p>
							<p>
								<strong>Integration data.</strong> If you connect Slack or
								Discord, we store the incoming-webhook URL for the channel you
								choose, encrypted, plus a label with the team and channel name.
								We use it only to post the Vitalgate alerts you've enabled to
								that channel, and we don't read your Slack or Discord messages.
							</p>
							<p>
								<strong>Preferences.</strong> Your notification settings and
								your workspace's alert rules.
							</p>
							<p>
								<strong>Session data.</strong> To keep you signed in and let you
								spot unfamiliar sign-ins, we store your session token, IP
								address, browser user-agent, and sign-in times. You can see and
								revoke your sessions from Settings → Security.
							</p>
							<p>
								<strong>Contact form.</strong> If you use the contact form, we
								receive the name, email address, and message you send, by email.
							</p>
							<p>
								<strong>Server logs.</strong> Our hosting provider keeps
								standard request logs (such as IP address, requested URL, and
								time) to operate and secure the site.
							</p>
						</section>

						<section>
							<h2>3. Where your code runs</h2>
							<p>
								Lighthouse audits run on <strong>your own</strong> GitHub
								Actions runner, using the workflow file Vitalgate commits to
								your repository. Your application is never built, started, or
								run on our infrastructure. Only the resulting metrics and the
								pull request details listed above are sent to us, authenticated
								with a short-lived token GitHub signs for that repository.
							</p>
						</section>

						<section>
							<h2>4. How we use it, and why we're allowed to</h2>
							<ul>
								<li>
									<strong>To provide the Service</strong> — sign you in, connect
									your repositories, check results against your budgets, show
									your dashboard, and deliver alerts — by email to workspace
									members who haven't turned them off, and to Slack or Discord
									if connected — plus the weekly digest if your workspace turns
									it on. This is necessary to perform our agreement with you
									(the{" "}
									<Link to="/terms" className="text-primary hover:underline">
										Terms of Service
									</Link>
									).
								</li>
								<li>
									<strong>To keep the Service secure</strong> — session records,
									server logs, and rate limiting on sign-in. This is in our
									legitimate interest in protecting your account and the
									Service.
								</li>
								<li>
									<strong>To answer you</strong> when you contact us, based on
									your request.
								</li>
							</ul>
							<p>
								We don't use your data for advertising, we don't sell it, and we
								don't run analytics or ad-tracking scripts on this site.
							</p>
						</section>

						<section>
							<h2>5. Who processes it for us</h2>
							<p>
								We share data only with the services needed to run Vitalgate:
							</p>
							<ul>
								<li>
									<strong>GitHub</strong> — sign-in, and access to the
									repositories you connect.
								</li>
								<li>
									<strong>Vercel</strong> — hosts the application and keeps its
									request logs.
								</li>
								<li>
									<strong>Neon</strong> — hosts our Postgres database, where the
									data above is stored.
								</li>
								<li>
									<strong>Resend</strong> — sends alert, invitation, and weekly
									digest emails, and delivers contact form messages to us.
								</li>
								<li>
									<strong>Polar</strong> — only if you subscribe to Pro: takes
									the payment as merchant of record, with your name, email, and
									billing details. We never see your card number; we keep only
									the subscription's status and renewal date.
								</li>
								<li>
									<strong>Slack / Discord</strong> — only if you connect them,
									to receive the alerts posted to your channel.
								</li>
								<li>
									<strong>Your webhook endpoint</strong> — only if you connect
									one: each alert (repository, pull request number, title and
									author, and the metrics that broke) is sent to the URL you
									chose.
								</li>
							</ul>
							<p>
								We may also disclose data if the law requires it, for example in
								response to a valid court order.
							</p>
						</section>

						<section>
							<h2>6. Where your data is stored</h2>
							<p>
								Our database is hosted in the United States, and the services
								above may process data in the United States and other countries.
								If you're outside the United States, your data is transferred
								there to provide the Service, relying on those providers'
								standard data protection terms for international transfers.
							</p>
						</section>

						<section>
							<h2>7. How long we keep it</h2>
							<p>
								We keep your data while your account and workspace are active.
								Disconnecting a repository immediately deletes its budgets, pull
								request history, and alerts. Disconnecting an integration
								deletes it immediately. Revoked or expired sessions are removed
								from your list.
							</p>
							<p>
								You can delete your account yourself from Settings → Security.
								That deletes your personal data right away, along with any
								workspace where you're the only owner; workspaces you share with
								other owners stay with them. Payment records kept by Polar are
								anonymized but retained for tax purposes. You can also email{" "}
								<ContactEmail /> and we'll delete your account within 30 days.
								Contact form emails are kept only as long as needed to answer
								you.
							</p>
						</section>

						<section>
							<h2>8. Security</h2>
							<p>
								Traffic to the site is encrypted with HTTPS. Slack, Discord and
								webhook URLs, webhook signing secrets and GitHub sign-in tokens
								are encrypted at rest.
								Every request for workspace data is checked against your active
								workspace, so one workspace can't read another's data. No system
								is perfectly secure; if a breach affects your personal data,
								we'll tell you without undue delay.
							</p>
						</section>

						<section>
							<h2>9. Cookies and local storage</h2>
							<p>
								We use only the cookies our sign-in system needs: one to keep
								you signed in, and short-lived ones that protect the GitHub
								sign-in flow. Your light/dark theme choice is saved in your
								browser's local storage. No advertising cookies, no third-party
								tracking pixels.
							</p>
						</section>

						<section>
							<h2>10. Your rights</h2>
							<p>
								You can ask us to give you a copy of your personal data, correct
								it, delete it, or stop or limit how we use it, and to receive it
								in a portable format. These rights come from the Dominican
								Republic's personal data protection law (Ley No. 172-13) and, if
								you're in the European Union or the United Kingdom, from the
								GDPR.
							</p>
							<p>
								Email <ContactEmail /> to make a request. We'll answer within 30
								days. You can also review and revoke your sessions, and delete
								your account, yourself from Settings → Security. If you're in
								the EU or UK and aren't happy with our answer, you can complain
								to your local data protection authority.
							</p>
						</section>

						<section>
							<h2>11. Children</h2>
							<p>
								Vitalgate is a developer tool for teams and isn't meant for
								anyone under 16. We don't knowingly collect data from children.
							</p>
						</section>

						<section>
							<h2>12. Changes to this policy</h2>
							<p>
								If we materially change what we collect or how we use it, we'll
								update the effective date above and tell you by email or in the
								app before the change applies.
							</p>
						</section>

						<section>
							<h2>13. Contact</h2>
							<p>
								Questions about this policy or your data? Email <ContactEmail />{" "}
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
