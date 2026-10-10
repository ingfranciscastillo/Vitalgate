import { createServerFn } from "@tanstack/react-start";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { cruxOriginCache } from "@/db/schema";
import {
	assessCoreWebVitals,
	type CruxFormFactor,
	type CruxSnapshot,
	type SuggestedBudget,
	suggestBudgets,
} from "@/lib/crux";
import { fetchCruxSnapshot, isCruxConfigured } from "@/lib/crux.server";
import { cruxCheckSchema } from "@/lib/crux-checker";
import { consumeRateLimit, getClientIp } from "@/lib/rate-limit.server";
import { parseInput } from "@/lib/validation";

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

const FORM_FACTOR: Record<
	"all" | "phone" | "desktop",
	CruxFormFactor | undefined
> = { all: undefined, phone: "PHONE", desktop: "DESKTOP" };

export type CruxCheckResult =
	| {
			status: "ok";
			origin: string;
			snapshot: CruxSnapshot;
			assessment: ReturnType<typeof assessCoreWebVitals>;
			budgets: SuggestedBudget[];
	  }
	| { status: "no-data"; origin: string }
	| { status: "invalid-url" }
	| { status: "rate-limited" }
	| { status: "unavailable" };

/**
 * The public Core Web Vitals checker: real-user p75s for any origin from the
 * Chrome UX Report, with Google's pass/fail assessment and suggested PR
 * budgets. No sign-in, so answers are cached per origin and device for a
 * day, and only lookups that reach Google count against a per-IP limit.
 */
export const checkCoreWebVitals = createServerFn({ method: "GET" })
	.validator(parseInput(cruxCheckSchema))
	.handler(async ({ data }): Promise<CruxCheckResult> => {
		const origin = toCheckOrigin(data.url);
		if (!origin) return { status: "invalid-url" };
		if (!isCruxConfigured()) return { status: "unavailable" };

		const answer = (snapshot: CruxSnapshot | null): CruxCheckResult =>
			snapshot
				? {
						status: "ok",
						origin,
						snapshot,
						assessment: assessCoreWebVitals(snapshot.metrics),
						budgets: suggestBudgets(snapshot.metrics),
					}
				: { status: "no-data", origin };

		const key = `${origin}|${data.device}`;
		const [cached] = await db
			.select()
			.from(cruxOriginCache)
			.where(eq(cruxOriginCache.key, key))
			.limit(1);
		if (cached && Date.now() - cached.fetchedAt.getTime() < CACHE_TTL_MS) {
			return answer(cached.snapshot);
		}

		const allowed = await consumeRateLimit(`crux-check:${getClientIp()}`, {
			max: 10,
			windowSeconds: 10 * 60,
		});
		if (!allowed) return { status: "rate-limited" };

		let snapshot: CruxSnapshot | null;
		try {
			snapshot = await fetchCruxSnapshot(origin, FORM_FACTOR[data.device]);
		} catch (err) {
			console.error("CrUX check failed", err);
			return cached ? answer(cached.snapshot) : { status: "unavailable" };
		}

		await db
			.insert(cruxOriginCache)
			.values({ key, snapshot, fetchedAt: new Date() })
			.onConflictDoUpdate({
				target: cruxOriginCache.key,
				set: { snapshot, fetchedAt: new Date() },
			});
		return answer(snapshot);
	});

/** "example.com/pricing" → "https://example.com". CrUX keys data by origin; http sites keep their scheme. */
function toCheckOrigin(input: string): string | null {
	const raw = /^[a-z]+:\/\//i.test(input) ? input : `https://${input}`;
	try {
		const url = new URL(raw);
		if (url.protocol !== "https:" && url.protocol !== "http:") return null;
		if (!url.hostname.includes(".")) return null;
		return url.origin;
	} catch {
		return null;
	}
}
