import { escapeHtml } from "@/lib/html";

/**
 * Shared look for Vitalgate's lifecycle emails: table layout and inline
 * styles (what email clients render reliably), one primary button, light
 * footer. Body paragraphs are trusted HTML built by the caller — escape any
 * user-controlled text in them with escapeHtml.
 */
export interface EmailContent {
	/** Inbox preview text, shown after the subject. */
	preheader: string;
	heading: string;
	/** Trusted HTML paragraphs (or a list) — escape user data before passing. */
	body: string[];
	cta: { label: string; url: string };
	/** Trusted HTML shown under the button, e.g. a secondary link. */
	afterCta?: string;
	/** Why they got it and how to stop it. */
	footer: string;
}

const BRAND = "#DC7F2E";
const TEXT = "#111317";
const MUTED = "#5B6470";

export function renderEmail(content: EmailContent): string {
	const paragraphs = content.body
		.map((p) =>
			p.startsWith("<ol") || p.startsWith("<ul")
				? p
				: `<p style="margin: 0 0 16px; font-size: 15px; line-height: 1.6; color: ${TEXT};">${p}</p>`,
		)
		.join("\n");
	return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(content.heading)}</title></head>
<body style="margin: 0; padding: 0; background: #F4F4F2;">
<div style="display: none; max-height: 0; overflow: hidden; opacity: 0;">${escapeHtml(content.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background: #F4F4F2;">
<tr><td align="center" style="padding: 32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width: 560px; background: #FFFFFF; border: 1px solid #E4E4E0; border-top: 4px solid ${BRAND}; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;">
<tr><td style="padding: 28px 32px 8px; font-size: 15px; font-weight: 700; color: ${TEXT};">Vitalgate</td></tr>
<tr><td style="padding: 8px 32px 8px;">
<h1 style="margin: 0 0 16px; font-size: 22px; line-height: 1.3; color: ${TEXT};">${escapeHtml(content.heading)}</h1>
${paragraphs}
<table role="presentation" cellpadding="0" cellspacing="0" style="margin: 8px 0 20px;"><tr><td style="background: ${BRAND};">
<a href="${content.cta.url}" style="display: inline-block; padding: 12px 22px; font-size: 15px; font-weight: 600; color: #FFFFFF; text-decoration: none;">${escapeHtml(content.cta.label)}</a>
</td></tr></table>
${content.afterCta ? `<p style="margin: 0 0 16px; font-size: 14px; line-height: 1.6; color: ${MUTED};">${content.afterCta}</p>` : ""}
<p style="margin: 0 0 24px; font-size: 15px; line-height: 1.6; color: ${TEXT};">Francis<br><span style="color: ${MUTED};">Vitalgate</span></p>
</td></tr>
<tr><td style="padding: 16px 32px 24px; border-top: 1px solid #E4E4E0; font-size: 12px; line-height: 1.5; color: ${MUTED};">${content.footer}</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

/** Numbered steps, styled to match the body text. Items are trusted HTML. */
export function emailSteps(items: string[]): string {
	return `<ol style="margin: 0 0 16px; padding-left: 22px; font-size: 15px; line-height: 1.6; color: ${TEXT};">${items
		.map((i) => `<li style="margin-bottom: 6px;">${i}</li>`)
		.join("")}</ol>`;
}
