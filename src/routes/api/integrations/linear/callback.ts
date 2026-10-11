import { createFileRoute } from "@tanstack/react-router";
import { handleIntegrationCallback } from "@/lib/integration-callback.server";
import { connectLinear } from "@/lib/issue-trackers.server";

export const Route = createFileRoute("/api/integrations/linear/callback")({
	server: {
		handlers: {
			GET: ({ request }) =>
				handleIntegrationCallback(request, "linear", (code, org) =>
					connectLinear(org, code),
				),
		},
	},
});
