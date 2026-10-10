/**
 * Canonical origin for the public marketing pages (canonical tags, JSON-LD,
 * robots.txt/sitemap.xml). No custom domain exists yet post-rebrand — update
 * this if one is added, and public/robots.txt + public/sitemap.xml's
 * hardcoded URLs alongside it (those can't import this constant, they're
 * static files served as-is).
 */
export const SITE_URL = "https://vitalgate.vercel.app";

/** Meta tags that keep a private, per-user page out of search results — the actual access control is the _authenticated redirect, this is defense in depth. */
export const NOINDEX_META = [{ name: "robots", content: "noindex, nofollow" }];

/**
 * Open Graph / Twitter image tags for a 1200x630 PNG under public/. Pages
 * with their own card (comparisons, the Core Web Vitals checker) pass its
 * path; everything else shares /og-image.png. The PNGs are rendered by
 * scripts/render-og-images.mjs — re-run it when their text changes.
 */
export function ogImageMeta(path = "/og-image.png") {
	const url = `${SITE_URL}${path}`;
	return [
		{ property: "og:image", content: url },
		{ property: "og:image:type", content: "image/png" },
		{ property: "og:image:width", content: "1200" },
		{ property: "og:image:height", content: "630" },
		{ name: "twitter:image", content: url },
	];
}

export const OG_IMAGE_META = ogImageMeta();
