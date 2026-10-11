import { createFileRoute } from "@tanstack/react-router";
import { COMPETITORS } from "@/lib/competitors";
import { CWV_SITES } from "@/lib/cwv-sites";
import { SITE_URL } from "@/lib/seo";

/**
 * /sitemap.xml, generated so new comparison and Core Web Vitals pages are
 * listed as soon as they're added to their catalogs.
 */
const STATIC: { path: string; priority: string }[] = [
	{ path: "/", priority: "1.0" },
	{ path: "/pricing", priority: "0.8" },
	{ path: "/tools/core-web-vitals", priority: "0.8" },
	{ path: "/compare", priority: "0.6" },
	{ path: "/contact", priority: "0.3" },
	{ path: "/privacy-policy", priority: "0.2" },
	{ path: "/terms", priority: "0.2" },
	{ path: "/login", priority: "0.3" },
];

function sitemap(): string {
	const urls = [
		...STATIC,
		...COMPETITORS.map((c) => ({
			path: `/compare/${c.slug}`,
			priority: "0.6",
		})),
		...CWV_SITES.map((s) => ({
			path: `/tools/core-web-vitals/${s.slug}`,
			priority: "0.5",
		})),
	];
	return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
	.map(
		(u) =>
			`  <url><loc>${SITE_URL}${u.path}</loc><priority>${u.priority}</priority></url>`,
	)
	.join("\n")}
</urlset>
`;
}

export const Route = createFileRoute("/sitemap.xml")({
	server: {
		handlers: {
			GET: () =>
				new Response(sitemap(), {
					headers: {
						"content-type": "application/xml; charset=utf-8",
						"cache-control": "public, max-age=3600, s-maxage=86400",
					},
				}),
		},
	},
});
