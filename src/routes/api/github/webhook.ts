import { createFileRoute } from "@tanstack/react-router";
import {
	handleWebhookEvent,
	isValidWebhookSignature,
} from "@/lib/github-webhook.server";

/**
 * The GitHub App's webhook URL. GitHub sends installation, repository-access
 * and repository events here; only requests signed with the webhook secret
 * are acted on.
 */
async function handleWebhook(request: Request): Promise<Response> {
	// The signature covers the exact bytes GitHub sent, so read the raw body
	// before parsing it.
	const rawBody = await request.text();
	if (
		!isValidWebhookSignature(
			rawBody,
			request.headers.get("x-hub-signature-256"),
		)
	) {
		return Response.json({ error: "Invalid signature" }, { status: 401 });
	}

	const event = request.headers.get("x-github-event") ?? "";
	if (event === "ping") return Response.json({ ok: true });

	let payload: unknown;
	try {
		payload = JSON.parse(rawBody);
	} catch {
		return Response.json({ error: "Body must be JSON" }, { status: 400 });
	}

	const result = await handleWebhookEvent(
		event,
		payload as Parameters<typeof handleWebhookEvent>[1],
	);
	console.log(`GitHub webhook ${event}: ${result}`);
	return Response.json({ ok: true, result });
}

export const Route = createFileRoute("/api/github/webhook")({
	server: {
		handlers: {
			POST: ({ request }) => handleWebhook(request),
		},
	},
});
