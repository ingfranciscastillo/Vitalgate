import { randomUUID } from "node:crypto";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { rateLimit } from "@/db/schema";

/**
 * Fixed-window rate limit for Vitalgate's own endpoints, stored in
 * better-auth's rate_limit table (one shared store across serverless
 * instances — in-memory counters would reset per instance). Keys are
 * namespaced (e.g. "contact:<ip>") so they never collide with better-auth's
 * own entries. Here last_request holds the start of the current window.
 *
 * Returns true if the request is allowed. A single upsert, so concurrent
 * requests can't both read a stale count.
 */
export async function consumeRateLimit(
	key: string,
	{ max, windowSeconds }: { max: number; windowSeconds: number },
): Promise<boolean> {
	const now = Date.now();
	const windowStart = now - windowSeconds * 1000;
	const expired = sql`${rateLimit.lastRequest} < ${windowStart}`;

	const [row] = await db
		.insert(rateLimit)
		.values({ id: randomUUID(), key, count: 1, lastRequest: now })
		.onConflictDoUpdate({
			target: rateLimit.key,
			set: {
				count: sql`case when ${expired} then 1 else ${rateLimit.count} + 1 end`,
				lastRequest: sql`case when ${expired} then ${now} else ${rateLimit.lastRequest} end`,
			},
		})
		.returning({ count: rateLimit.count });

	return (row?.count ?? 1) <= max;
}

/**
 * The caller's IP. On Vercel, x-forwarded-for is set by the platform's edge
 * (client-supplied values are overwritten), and its first entry is the
 * client.
 */
export function getClientIp(): string {
	const headers = getRequestHeaders();
	return (
		headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
		headers.get("x-real-ip") ||
		"unknown"
	);
}
