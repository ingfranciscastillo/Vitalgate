/**
 * A real Chrome UX Report snapshot of tools developers use daily, shown on
 * the landing page. p75 over the 28 days to `period`. Re-check it with the
 * free checker (/tools/core-web-vitals) and update it every month or so.
 */
export const CWV_SNAPSHOT = {
	period: "the 28 days to October 8, 2026",
	sites: [
		{ name: "GitHub", passed: true },
		{ name: "Stripe", passed: true },
		{ name: "Netlify", passed: true },
		{ name: "Slack", passed: true },
		{ name: "Vercel", passed: false },
		{ name: "Linear", passed: false },
		{ name: "Notion", passed: false },
		{ name: "Supabase", passed: false },
		{ name: "Figma", passed: false },
		{ name: "Atlassian", passed: false },
	],
} as const;
