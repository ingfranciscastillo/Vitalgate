import { createFileRoute } from "@tanstack/react-router";
import { rejectUnlessCron } from "@/lib/cron-auth.server";
import { runWeeklyDigest } from "@/lib/weekly-digest.server";

// Vercel Cron always triggers with GET (see vercel.json's crons entry for
// this path). Callable manually too — curl with the CRON_SECRET bearer
// token — for testing without waiting for Monday.
export const Route = createFileRoute("/api/cron/weekly-digest")({
	server: {
		handlers: {
			GET: async ({ request }) =>
				rejectUnlessCron(request) ??
				Response.json({ results: await runWeeklyDigest() }),
		},
	},
});
