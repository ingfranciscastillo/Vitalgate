import { escapeHtml } from "@/lib/html";
import type { PrStatus } from "@/lib/mock-data";

/**
 * The README badge: a flat, shields.io-style SVG with the result of a
 * repository's latest audited pull request.
 */

const MESSAGE: Record<PrStatus | "none", { text: string; color: string }> = {
	passing: { text: "passing", color: "#2e9e5b" },
	warning: { text: "warnings", color: "#c98a0c" },
	failing: { text: "failing", color: "#d33a2c" },
	none: { text: "no audits yet", color: "#8a8f98" },
};

/** Rough Verdana 11px advance width, enough to size the boxes. */
const textWidth = (text: string) => Math.round(text.length * 6.6) + 10;

export function renderBadge(status: PrStatus | "none"): string {
	const label = "performance budgets";
	const { text, color } = MESSAGE[status];
	const lw = textWidth(label);
	const mw = textWidth(text);
	const w = lw + mw;
	const title = escapeHtml(`${label}: ${text}`);
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="20" role="img" aria-label="${title}"><title>${title}</title><linearGradient id="s" x2="0" y2="100%"><stop offset="0" stop-color="#bbb" stop-opacity=".1"/><stop offset="1" stop-opacity=".1"/></linearGradient><clipPath id="r"><rect width="${w}" height="20" rx="3" fill="#fff"/></clipPath><g clip-path="url(#r)"><rect width="${lw}" height="20" fill="#24292f"/><rect x="${lw}" width="${mw}" height="20" fill="${color}"/><rect width="${w}" height="20" fill="url(#s)"/></g><g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11"><text x="${lw / 2}" y="14">${label}</text><text x="${lw + mw / 2}" y="14">${escapeHtml(text)}</text></g></svg>`;
}
