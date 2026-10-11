import { createFileRoute } from "@tanstack/react-router";
import { handleIntegrationCallback } from "@/lib/integration-callback.server";
import { connectJira } from "@/lib/jira.server";

export const Route = createFileRoute("/api/integrations/jira/callback")({
	server: {
		handlers: {
			GET: ({ request }) =>
				handleIntegrationCallback(request, "jira", (code, org) =>
					connectJira(org, code),
				),
		},
	},
});
