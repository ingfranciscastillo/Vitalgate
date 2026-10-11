import { createFileRoute } from "@tanstack/react-router";
import { handleIntegrationCallback } from "@/lib/integration-callback.server";
import {
	exchangeDiscordCode,
	saveIntegration,
} from "@/lib/integrations.server";

export const Route = createFileRoute("/api/integrations/discord/callback")({
	server: {
		handlers: {
			GET: ({ request }) =>
				handleIntegrationCallback(request, "discord", async (code, org) =>
					saveIntegration(org, "discord", await exchangeDiscordCode(code)),
				),
		},
	},
});
