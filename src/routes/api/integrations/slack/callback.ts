import { createFileRoute } from "@tanstack/react-router";
import { handleIntegrationCallback } from "@/lib/integration-callback.server";
import { exchangeSlackCode, saveIntegration } from "@/lib/integrations.server";

export const Route = createFileRoute("/api/integrations/slack/callback")({
	server: {
		handlers: {
			GET: ({ request }) =>
				handleIntegrationCallback(request, "slack", async (code, org) =>
					saveIntegration(org, "slack", await exchangeSlackCode(code)),
				),
		},
	},
});
