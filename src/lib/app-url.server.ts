/**
 * The public origin Vitalgate is served from, e.g. "https://vitalgate.app".
 * Single source for every absolute URL we hand to someone else: OAuth
 * redirect URIs, invitation and digest email links, and the ingest URL
 * baked into the workflow committed to users' repos.
 *
 * Reads BETTER_AUTH_URL, the same variable better-auth uses for its own
 * callbacks, so the two can't drift apart. Falls back to localhost only in
 * development — in production a missing or non-https value would silently
 * produce links that point nowhere, so it fails loudly instead.
 */
export function getAppUrl(): string {
	const raw = process.env.BETTER_AUTH_URL;
	if (!raw) {
		if (process.env.NODE_ENV === "production") {
			throw new Error(
				"BETTER_AUTH_URL is not set. Set it to the app's public origin (e.g. https://vitalgate.app) in Vercel's project env vars.",
			);
		}
		return "http://localhost:3000";
	}

	const url = new URL(raw);
	if (process.env.NODE_ENV === "production" && url.protocol !== "https:") {
		throw new Error(`BETTER_AUTH_URL must use https in production: ${raw}`);
	}
	return url.origin;
}
