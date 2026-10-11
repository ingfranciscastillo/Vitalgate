import { createServerFn } from "@tanstack/react-start";
import { eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { cruxOriginCache } from "@/db/schema";
import {
	assessCoreWebVitals,
	type CruxSnapshot,
	type SuggestedBudget,
	suggestBudgets,
} from "@/lib/crux";
import { fetchCruxSnapshot, isCruxConfigured } from "@/lib/crux.server";
import { CWV_SITES, type CwvSite, getCwvSite } from "@/lib/cwv-sites";
import { consumeRateLimit } from "@/lib/rate-limit.server";
import { parseInput } from "@/lib/validation";

/**
 * Data for the public per-site pages (/tools/core-web-vitals/<slug>). They
 * share the checker's cache (crux_origin_cache, "<origin>|all"), kept for
 * three days here: CrUX is a rolling 28-day window, so a page that's a
 * couple of days old says the same thing. Only the curated sites in
 * cwv-sites.ts have pages, which bounds how often Google is queried.
 */

const PAGE_TTL_MS = 3 * 24 * 60 * 60 * 1000;

export interface PeerSummary {
	slug: string;
	name: string;
	assessment: ReturnType<typeof assessCoreWebVitals>;
	lcp: number | null;
	inp: number | null;
	cls: number | null;
}

export interface SiteReport {
	site: CwvSite;
	snapshot: CruxSnapshot | null;
	assessment: ReturnType<typeof assessCoreWebVitals> | null;
	budgets: SuggestedBudget[];
	/** Same-category sites we already have data for, for comparisons and links. */
	peers: PeerSummary[];
}

const keyOf = (origin: string) => `${origin}|all`;

async function snapshotFor(site: CwvSite): Promise<CruxSnapshot | null> {
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

export const getSiteReport = createServerFn({ method: "GET" })
	.validator(parseInput(z.string().min(1).max(100)))
	.handler(async ({ data: slug }): Promise<SiteReport | null> => {
		const site = getCwvSite(slug);
		if (!site) return null;

		const snapshot = await snapshotFor(site);
		const peerSites = CWV_SITES.filter(
			(s) => s.category === site.category && s.slug !== site.slug,
		);
		const peerRows = peerSites.length
			? await db
					.select({
						key: cruxOriginCache.key,
						snapshot: cruxOriginCache.snapshot,
					})
					.from(cruxOriginCache)
					.where(
						inArray(
							cruxOriginCache.key,
							peerSites.map((s) => keyOf(s.origin)),
						),
					)
			: [];
		const byKey = new Map(peerRows.map((r) => [r.key, r.snapshot]));
		const peers: PeerSummary[] = peerSites.flatMap((s) => {
			const snap = byKey.get(keyOf(s.origin));
			if (!snap) return [];
			return [
				{
					slug: s.slug,
					name: s.name,
					assessment: assessCoreWebVitals(snap.metrics),
					lcp: snap.metrics.LCP ?? null,
					inp: snap.metrics.INP ?? null,
					cls: snap.metrics.CLS ?? null,
				},
			];
		});

		return {
			site,
			snapshot,
			assessment: snapshot ? assessCoreWebVitals(snapshot.metrics) : null,
			budgets: snapshot ? suggestBudgets(snapshot.metrics) : [],
			peers,
		};
	});

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
