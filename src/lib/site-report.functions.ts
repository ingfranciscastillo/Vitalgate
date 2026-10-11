import { createServerFn } from "@tanstack/react-start";
import { inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { cruxOriginCache } from "@/db/schema";
import {
	assessCoreWebVitals,
	type CruxSnapshot,
	type SuggestedBudget,
	suggestBudgets,
} from "@/lib/crux";
import { CWV_SITES, type CwvSite, getCwvSite } from "@/lib/cwv-sites";
import { keyOf, snapshotFor } from "@/lib/site-report.server";
import { parseInput } from "@/lib/validation";

/**
 * Data for the public per-site pages (/tools/core-web-vitals/<slug>). They
 * share the checker's cache (crux_origin_cache, "<origin>|all"), kept for
 * three days here: CrUX is a rolling 28-day window, so a page that's a
 * couple of days old says the same thing. Only the curated sites in
 * cwv-sites.ts have pages, which bounds how often Google is queried.
 */

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
