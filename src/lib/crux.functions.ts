import { createServerFn } from "@tanstack/react-start";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { cruxReports, repos } from "@/db/schema";
import { ensureSession } from "@/lib/auth.functions";
import { type CruxSnapshot, toOrigin } from "@/lib/crux";
import { fetchCruxSnapshot, isCruxConfigured } from "@/lib/crux.server";
import { requireOrgAdmin } from "@/lib/org-access.server";
import { idSchema, parseInput } from "@/lib/validation";

/** CrUX publishes a new 28-day window daily, so a cached answer is good for a day. */
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export type RealUserMetrics =
	| { status: "not-configured" }
	| { status: "no-url" }
	| { status: "no-data"; origin: string }
	| { status: "error"; origin: string }
	| { status: "ok"; origin: string; snapshot: CruxSnapshot };

/**
 * Real-user metrics for a repo's production URL from the Chrome UX Report,
 * cached for a day per repo. Any workspace member can view them.
 */
export const getRealUserMetrics = createServerFn({ method: "GET" })
	.validator(parseInput(idSchema))
	.handler(async ({ data: repoId }): Promise<RealUserMetrics | null> => {
		const session = await ensureSession();
		const organizationId = session.session.activeOrganizationId;
		if (!organizationId) return null;

		const [repo] = await db
			.select({ id: repos.id, productionUrl: repos.productionUrl })
			.from(repos)
			.where(
				and(eq(repos.id, repoId), eq(repos.organizationId, organizationId)),
			)
			.limit(1);
		if (!repo) return null;
		if (!isCruxConfigured()) return { status: "not-configured" };
		const origin = repo.productionUrl;
		if (!origin) return { status: "no-url" };

		const [cached] = await db
			.select()
			.from(cruxReports)
			.where(eq(cruxReports.repoId, repo.id))
			.limit(1);
		const usable = cached?.origin === origin ? cached : undefined;
		const fresh =
			usable && Date.now() - usable.fetchedAt.getTime() < CACHE_TTL_MS;

		const answer = (snapshot: CruxSnapshot | null): RealUserMetrics =>
			snapshot
				? { status: "ok", origin, snapshot }
				: { status: "no-data", origin };

		if (usable && fresh) return answer(usable.snapshot);

		let snapshot: CruxSnapshot | null;
		try {
			snapshot = await fetchCruxSnapshot(origin);
		} catch (err) {
			console.error("CrUX query failed", err);
			// A stale answer beats none while Google is unreachable.
			return usable ? answer(usable.snapshot) : { status: "error", origin };
		}

		await db
			.insert(cruxReports)
			.values({ repoId: repo.id, origin, snapshot, fetchedAt: new Date() })
			.onConflictDoUpdate({
				target: cruxReports.repoId,
				set: { origin, snapshot, fetchedAt: new Date() },
			});
		return answer(snapshot);
	});

/**
 * Sets (or clears, with an empty string) the live site a repo's real-user
 * metrics are read for. Only its origin is kept. Owners and admins only.
 */
export const setRepoProductionUrl = createServerFn({ method: "POST" })
	.validator(
		parseInput(
			z.object({ repoId: idSchema, url: z.string().trim().max(2048) }),
		),
	)
	.handler(async ({ data }) => {
		const { organizationId } = await requireOrgAdmin();
		const origin = data.url === "" ? null : toOrigin(data.url);
		if (data.url !== "" && !origin) {
			throw new Error("Enter a full https:// URL, like https://example.com");
		}

		const [updated] = await db
			.update(repos)
			.set({ productionUrl: origin })
			.where(
				and(
					eq(repos.id, data.repoId),
					eq(repos.organizationId, organizationId),
				),
			)
			.returning({ id: repos.id });
		if (!updated) throw new Error("Repository not found");
		await db.delete(cruxReports).where(eq(cruxReports.repoId, updated.id));
		return { origin };
	});
