import { createFileRoute } from "@tanstack/react-router";
import { rejectUnlessCron } from "@/lib/cron-auth.server";
import { runDailyDigest } from "@/lib/daily-digest.server";
import { runLifecycleNudges } from "@/lib/lifecycle.server";

// Vercel Cron triggers this every morning (see vercel.json). Callable
// manually with the CRON_SECRET bearer token for testing.
export const Route = createFileRoute("/api/cron/daily-digest")({
	server: {
		handlers: {
			GET: async ({ request }) =>
				rejectUnlessCron(request) ??
				Response.json({
					results: await runDailyDigest(),
					// Onboarding reminders ride on the same daily cron.
					lifecycle: await runLifecycleNudges(),
				}),
		},
	},
});
