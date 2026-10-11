import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { cruxOriginCache } from "@/db/schema";
import type { CruxSnapshot } from "@/lib/crux";
import { fetchCruxSnapshot, isCruxConfigured } from "@/lib/crux.server";
import { CWV_SITES, type CwvSite } from "@/lib/cwv-sites";
import { consumeRateLimit } from "@/lib/rate-limit.server";

/**
 * Cached Chrome UX Report data for the public per-site pages. Its own
 * .server.ts so nothing here (db, CrUX key) reaches the browser bundle.
 */

const PAGE_TTL_MS = 3 * 24 * 60 * 60 * 1000;

export const keyOf = (origin: string) => `${origin}|all`;

export async function snapshotFor(site: CwvSite): Promise<CruxSnapshot | null> {
	const [cached] = await db
		.select()
		.from(cruxOriginCache)
		.where(eq(cruxOriginCache.key, keyOf(site.origin)))
		.limit(1);
	if (cached && Date.now() - cached.fetchedAt.getTime() < PAGE_TTL_MS) {
		return cached.snapshot;
	}
	// A crawler can open every page at once; share Google's 150/min quota
	// with the public checker by refreshing at most 40 pages a minute and
	// serving the stale copy otherwise.
	const allowed =
		isCruxConfigured() &&
		(await consumeRateLimit("crux-site-pages", { max: 40, windowSeconds: 60 }));
	if (!allowed) return cached?.snapshot ?? null;
	try {
		const snapshot = await fetchCruxSnapshot(site.origin);
		await db
			.insert(cruxOriginCache)
			.values({ key: keyOf(site.origin), snapshot, fetchedAt: new Date() })
			.onConflictDoUpdate({
				target: cruxOriginCache.key,
				set: { snapshot, fetchedAt: new Date() },
			});
		return snapshot;
	} catch (err) {
		console.error(`CrUX refresh failed for ${site.origin}`, err);
		return cached?.snapshot ?? null;
	}
}

/**
 * Daily cron: refreshes the stalest site pages (up to `limit`), so peer
 * comparisons have data before anyone visits. Sequential and well under
 * CrUX's per-minute quota.
 */
export async function warmSitePages(limit = 40): Promise<number> {
	const rows = await db
		.select({ key: cruxOriginCache.key, fetchedAt: cruxOriginCache.fetchedAt })
		.from(cruxOriginCache)
		.where(
			inArray(
				cruxOriginCache.key,
				CWV_SITES.map((s) => keyOf(s.origin)),
			),
		);
	const fetched = new Map(rows.map((r) => [r.key, r.fetchedAt.getTime()]));
	const stale = CWV_SITES.filter(
		(s) => Date.now() - (fetched.get(keyOf(s.origin)) ?? 0) >= PAGE_TTL_MS,
	)
		.sort(
			(a, b) =>
				(fetched.get(keyOf(a.origin)) ?? 0) -
				(fetched.get(keyOf(b.origin)) ?? 0),
		)
		.slice(0, limit);
	let warmed = 0;
	for (const site of stale) {
		if ((await snapshotFor(site)) !== null) warmed++;
	}
	return warmed;
}
