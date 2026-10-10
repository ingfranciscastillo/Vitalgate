import { emailSteps, renderEmail } from "@/lib/email-layout";
import { escapeHtml } from "@/lib/html";
import type { PrStatus } from "@/lib/mock-data";

/**
 * Onboarding emails, one job each, all leading to the first audited pull
 * request: welcome (sign-up), connect nudge (a day in, no repository), PR
 * nudge (three days after connecting, nothing audited) and the first-audit
 * email. Replies go to the operator (see lifecycle.server.ts).
 */

export interface LifecycleEmail {
	subject: string;
	html: string;
}

const link = (url: string, text: string) =>
	`<a href="${url}" style="color: #B45F17;">${escapeHtml(text)}</a>`;

/** First word of the name, raw: escape it before putting it in HTML (headings are escaped by renderEmail). */
const firstName = (name: string) => name.trim().split(/\s+/)[0] || "there";

const tipsFooter = (appUrl: string) =>
	`You're getting this while you set up Vitalgate. Turn off "Getting started tips" in your ${link(`${appUrl}/settings`, "notification settings")} to stop these.`;

export function welcomeEmail(opts: {
	name: string;
	appUrl: string;
}): LifecycleEmail {
	return {
		subject: "Your first performance check is 3 steps away",
		html: renderEmail({
			preheader:
				"Install the GitHub App, connect a repository, open a pull request.",
			heading: `Welcome to Vitalgate, ${firstName(opts.name)}`,
			body: [
				"Vitalgate runs Lighthouse on every pull request and fails its check when a change breaks your performance budgets, before it ships.",
				"Getting to your first check takes a few minutes:",
				emailSteps([
					"<strong>Install the GitHub App</strong> on just the repositories you choose.",
					"<strong>Connect a repository.</strong> Vitalgate commits one workflow file and sets starting budgets.",
					"<strong>Open a pull request.</strong> It gets a Vitalgate check and a results comment.",
				]),
			],
			cta: {
				label: "Connect a repository",
				url: `${opts.appUrl}/repositories/new`,
			},
			afterCta:
				"Questions or stuck on a step? Reply to this email, it comes straight to me.",
			footer: `You're getting this because you signed up for Vitalgate with GitHub.`,
		}),
	};
}

export function connectNudgeEmail(opts: {
	name: string;
	appUrl: string;
}): LifecycleEmail {
	return {
		subject: "Vitalgate isn't checking any repository yet",
		html: renderEmail({
			preheader:
				"Connecting one takes about two minutes, and one repository is free.",
			heading: "Connect a repository to get started",
			body: [
				`Hi ${escapeHtml(firstName(opts.name))}, you signed up yesterday but haven't connected a repository, so Vitalgate has nothing to check yet.`,
				"It takes about two minutes. You install the GitHub App on only the repositories you pick, and Vitalgate commits one workflow file. If Vercel, Netlify or Render already deploys previews for your pull requests, Vitalgate audits those, with nothing to build.",
			],
			cta: {
				label: "Connect a repository",
				url: `${opts.appUrl}/repositories/new`,
			},
			afterCta: "Hit a problem along the way? Reply and tell me what happened.",
			footer: tipsFooter(opts.appUrl),
		}),
	};
}

export function prNudgeEmail(opts: {
	name: string;
	repoFullName: string;
	appUrl: string;
}): LifecycleEmail {
	const repo = escapeHtml(opts.repoFullName);
	return {
		subject: "Open a pull request to see Vitalgate work",
		html: renderEmail({
			preheader: `${opts.repoFullName} is connected, but no pull request has been audited yet.`,
			heading: "One step left: a pull request",
			body: [
				`Hi ${escapeHtml(firstName(opts.name))}, <strong>${repo}</strong> has been connected for a few days, but no pull request has been audited yet. Vitalgate only runs on pull requests, so that's where you'll see it.`,
				"Any small change works, even a README edit. A few minutes after you open it, the pull request gets the Vitalgate check and a comment with every metric against its budget.",
			],
			cta: {
				label: "Open a pull request",
				url: `https://github.com/${opts.repoFullName}/compare`,
			},
			afterCta: `Opened one and nothing showed up? Look at the ${link(`https://github.com/${opts.repoFullName}/actions`, "Actions tab")} for the "Vitalgate Performance Budgets" run, or reply with what you see.`,
			footer: tipsFooter(opts.appUrl),
		}),
	};
}

const RESULT: Record<PrStatus, string> = {
	passing: "every budget passed",
	warning: "it passed, with warnings on some soft budgets",
	failing: "it broke at least one required budget, so its check failed",
};

export function firstAuditEmail(opts: {
	name: string;
	repoFullName: string;
	prNumber: number;
	status: PrStatus;
	pullUrl: string;
}): LifecycleEmail {
	const pr = `${opts.repoFullName} #${opts.prNumber}`;
	return {
		subject: `${pr}: your first Vitalgate check`,
		html: renderEmail({
			preheader: "What it found, and the one setting that makes it stick.",
			heading: "Your first pull request is audited",
			body: [
				`Hi ${escapeHtml(firstName(opts.name))}, Vitalgate just audited <strong>${escapeHtml(pr)}</strong>: ${RESULT[opts.status]}.`,
				`One setting makes it stick: in the repository's ${link(`https://github.com/${opts.repoFullName}/settings/branches`, "branch protection rules")}, require the <strong>Vitalgate</strong> status check. Then a pull request that breaks a required budget can't be merged.`,
			],
			cta: { label: "See the results", url: opts.pullUrl },
			footer: `You're getting this because it's the first audit in your Vitalgate workspace. It's only sent once.`,
		}),
	};
}
