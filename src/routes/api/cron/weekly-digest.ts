import { createHash, timingSafeEqual } from "node:crypto";
import { createFileRoute } from "@tanstack/react-router";
import { runWeeklyDigest } from "@/lib/weekly-digest.server";

function json(body: unknown, status = 200) {
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

async function handleWeeklyDigest(request: Request) {
	const expected = process.env.CRON_SECRET;
	if (!expected) {
		return json({ error: "CRON_SECRET is not configured" }, 500);
	}
	const authHeader = request.headers.get("authorization") ?? "";
	if (!secretsMatch(authHeader, `Bearer ${expected}`)) {
		return json({ error: "Unauthorized" }, 401);
	}

	const results = await runWeeklyDigest();
	return json({ results });
}

// Vercel Cron always triggers with GET (see vercel.json's crons entry for
// this path). Callable manually too — curl with the CRON_SECRET bearer
// token — for testing without waiting for Monday.
export const Route = createFileRoute("/api/cron/weekly-digest")({
	server: {
		handlers: {
			GET: ({ request }) => handleWeeklyDigest(request),
		},
	},
});
