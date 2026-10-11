import { escapeHtml } from "@/lib/html";
import type { AlertLevel } from "@/lib/mock-data";

/**
 * How alert notifications read in each channel. Pure formatting, kept apart
 * from alert-delivery.server.ts (which decides who gets what and sends it)
 * so it can be tested without a database. PR titles and authors are
 * untrusted text from whoever opened the pull request, so every format here
 * escapes them for its own markup.
 */

export interface AlertToDeliver {
	level: AlertLevel;
	title: string;
	message: string;
}

/** The pull request run that produced the alerts. Title and author come from the PR, so they're untrusted text. */
export interface AlertContext {
	organizationId: string;
	repoFullName: string;
	prNumber: number;
	prTitle: string;
	prAuthor: string;
	/** Vitalgate's own pull request row id, for the "View in Vitalgate" link. */
	pullId: string;
}

export interface AlertLinks {
	/** The pull request on GitHub. */
	pr: string;
	/** The pull request's page in Vitalgate. */
	app: string;
}

export function emailSubject(
	alerts: AlertToDeliver[],
	ctx: AlertContext,
): string {
	const what =
		alerts.length === 1 ? alerts[0].title : `${alerts.length} alerts`;
	// No line breaks in a header, whatever the repo or PR is called.
	return `[Vitalgate] ${what} on ${ctx.repoFullName} #${ctx.prNumber}`.replace(
		/[\r\n]+/g,
		" ",
	);
}

export function renderAlertEmail(
	alerts: AlertToDeliver[],
	ctx: AlertContext,
	links: AlertLinks,
): string {
	const items = alerts
		.map(
			(a) => `
				<li style="margin-bottom: 8px;">
					<strong style="color: ${a.level === "critical" ? "#b91c1c" : "#a16207"};">${escapeHtml(a.title)}</strong><br>
					${escapeHtml(a.message)}
				</li>`,
		)
		.join("");
	return `
		<div style="font-family: -apple-system, sans-serif; max-width: 520px; color: #111;">
			<h2 style="margin-bottom: 4px;">${escapeHtml(ctx.repoFullName)} #${ctx.prNumber}</h2>
			<p style="color: #666; margin-top: 0;">${escapeHtml(ctx.prTitle)} — by ${escapeHtml(ctx.prAuthor)}</p>
			<ul style="padding-left: 18px;">${items}</ul>
			<p><a href="${links.app}">View in Vitalgate →</a> &nbsp;·&nbsp; <a href="${links.pr}">Open the pull request</a></p>
			<p style="color: #666; font-size: 12px;">You get these because you're a member of this workspace. Turn them off in Vitalgate under Settings → Notifications.</p>
		</div>
	`;
}

/**
 * Slack mrkdwn treats <...> as links and mentions, so untrusted text has to
 * be escaped or a PR titled "<!channel>" would ping the whole channel.
 */
export function slackEscape(text: string): string {
	return text
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;");
}

export function slackPayload(
	alerts: AlertToDeliver[],
	ctx: AlertContext,
	links: AlertLinks,
) {
	const header = `<${links.pr}|${slackEscape(ctx.repoFullName)} #${ctx.prNumber}> · ${slackEscape(ctx.prTitle)} — ${slackEscape(ctx.prAuthor)}`;
	const lines = alerts.map(
		(a) =>
			`${a.level === "critical" ? ":red_circle:" : ":large_yellow_circle:"} *${slackEscape(a.title)}*\n${slackEscape(a.message)}`,
	);
	const text = [header, ...lines, `<${links.app}|View in Vitalgate>`].join(
		"\n\n",
	);
	return { text, unfurl_links: false, unfurl_media: false };
}

/** Escapes Discord markdown so untrusted text can't fake links or formatting. */
export function discordEscape(text: string): string {
	return text.replace(/([\\*_~`|>[\]()#-])/g, "\\$1");
}

export function discordPayload(
	alerts: AlertToDeliver[],
	ctx: AlertContext,
	links: AlertLinks,
) {
	return {
		username: "Vitalgate",
		// Never ping anyone, whatever the PR title contains (@everyone, <@id>…).
		allowed_mentions: { parse: [] },
		embeds: alerts.slice(0, 10).map((a) => ({
			title: `${a.title} — ${ctx.repoFullName} #${ctx.prNumber}`.slice(0, 256),
			url: links.app,
			description: [
				discordEscape(a.message),
				`${discordEscape(ctx.prTitle)} — ${discordEscape(ctx.prAuthor)}`,
				`[Open the pull request](${links.pr})`,
			]
				.join("\n\n")
				.slice(0, 4096),
			color: a.level === "critical" ? 0xdc2626 : 0xeab308,
		})),
	};
}

/**
 * Adaptive Card text supports a little Markdown, including [text](url)
 * links; lookalike brackets keep untrusted text from faking one.
 */
export function teamsEscape(text: string): string {
	return text
		.replace(/\[/g, "［")
		.replace(/\]/g, "］")
		.replace(/[*_]/g, "\\$&");
}

/**
 * For a Microsoft Teams channel, through a Workflows "Post to a channel
 * when a webhook request is received" flow: one Adaptive Card.
 */
export function teamsPayload(
	alerts: AlertToDeliver[],
	ctx: AlertContext,
	links: AlertLinks,
) {
	return {
		type: "message",
		attachments: [
			{
				contentType: "application/vnd.microsoft.card.adaptive",
				contentUrl: null,
				content: {
					$schema: "http://adaptivecards.io/schemas/adaptive-card.json",
					type: "AdaptiveCard",
					version: "1.4",
					body: [
						{
							type: "TextBlock",
							size: "Medium",
							weight: "Bolder",
							wrap: true,
							text: `${teamsEscape(ctx.repoFullName)} #${ctx.prNumber}`,
						},
						{
							type: "TextBlock",
							isSubtle: true,
							spacing: "None",
							wrap: true,
							text: `${teamsEscape(ctx.prTitle)} — ${teamsEscape(ctx.prAuthor)}`,
						},
						...alerts.slice(0, 10).flatMap((a) => [
							{
								type: "TextBlock",
								weight: "Bolder",
								color: a.level === "critical" ? "Attention" : "Warning",
								wrap: true,
								text: teamsEscape(a.title),
							},
							{
								type: "TextBlock",
								spacing: "None",
								wrap: true,
								text: teamsEscape(a.message),
							},
						]),
					],
					actions: [
						{
							type: "Action.OpenUrl",
							title: "View in Vitalgate",
							url: links.app,
						},
						{
							type: "Action.OpenUrl",
							title: "Open the pull request",
							url: links.pr,
						},
					],
				},
			},
		],
	};
}

/**
 * Google Chat reads <...> as links and mentions (<users/all> pings the
 * whole space), so untrusted text gets lookalike angle brackets.
 */
export function googleChatEscape(text: string): string {
	return text.replace(/</g, "‹").replace(/>/g, "›");
}

/** For a Google Chat space's incoming webhook: one formatted text message. */
export function googleChatPayload(
	alerts: AlertToDeliver[],
	ctx: AlertContext,
	links: AlertLinks,
) {
	const header = `*<${links.pr}|${googleChatEscape(ctx.repoFullName)} #${ctx.prNumber}>* · ${googleChatEscape(ctx.prTitle)} — ${googleChatEscape(ctx.prAuthor)}`;
	const lines = alerts.map(
		(a) =>
			`${a.level === "critical" ? "🔴" : "🟡"} *${googleChatEscape(a.title)}*\n${googleChatEscape(a.message)}`,
	);
	return {
		text: [header, ...lines, `<${links.app}|View in Vitalgate>`].join("\n\n"),
	};
}
