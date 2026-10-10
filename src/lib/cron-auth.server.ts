import { createHash, timingSafeEqual } from "node:crypto";

function json(body: unknown, status: number) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "content-type": "application/json" },
	});
}

/**
 * Constant-time comparison, so response timing doesn't reveal how much of
 * the secret a guess got right. Hashing first gives both sides the same
 * length, which timingSafeEqual requires.
 */
function secretsMatch(given: string, expected: string): boolean {
	const a = createHash("sha256").update(given).digest();
	const b = createHash("sha256").update(expected).digest();
	return timingSafeEqual(a, b);
}

/**
 * Checks a cron request's `Authorization: Bearer <CRON_SECRET>` (what Vercel
 * Cron sends). Returns an error response to send back, or null when the
 * request may proceed.
 */
export function rejectUnlessCron(request: Request): Response | null {
	const expected = process.env.CRON_SECRET;
	if (!expected) return json({ error: "CRON_SECRET is not configured" }, 500);
	const authHeader = request.headers.get("authorization") ?? "";
	if (!secretsMatch(authHeader, `Bearer ${expected}`)) {
		return json({ error: "Unauthorized" }, 401);
	}
	return null;
}
