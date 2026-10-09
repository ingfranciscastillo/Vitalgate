import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { integrations } from "@/db/schema";
import { getAppUrl } from "@/lib/app-url.server";
import { encryptSecret } from "@/lib/crypto.server";
import type { IntegrationProvider } from "@/lib/mock-data";

function getRedirectUri(provider: IntegrationProvider): string {
	return `${getAppUrl()}/api/integrations/${provider}/callback`;
}

export function getSlackAuthorizeUrl(state: string): string {
	const clientId = process.env.SLACK_CLIENT_ID;
	if (!clientId) throw new Error("SLACK_CLIENT_ID is not set");
	const params = new URLSearchParams({
		client_id: clientId,
		scope: "incoming-webhook",
		redirect_uri: getRedirectUri("slack"),
		state,
	});
	return `https://slack.com/oauth/v2/authorize?${params}`;
}

export function getDiscordAuthorizeUrl(state: string): string {
	const clientId = process.env.DISCORD_CLIENT_ID;
	if (!clientId) throw new Error("DISCORD_CLIENT_ID is not set");
	const params = new URLSearchParams({
		client_id: clientId,
		response_type: "code",
		scope: "webhook.incoming",
		redirect_uri: getRedirectUri("discord"),
		state,
	});
	return `https://discord.com/oauth2/authorize?${params}`;
}

interface ExchangeResult {
	label: string;
	webhookUrl: string;
}

/** Exchanges Slack's OAuth code for the incoming-webhook it granted. Slack returns the webhook URL directly in this response — no follow-up API call needed. */
export async function exchangeSlackCode(code: string): Promise<ExchangeResult> {
	const clientId = process.env.SLACK_CLIENT_ID;
	const clientSecret = process.env.SLACK_CLIENT_SECRET;
	if (!clientId || !clientSecret)
		throw new Error("Slack OAuth is not configured");

	const res = await fetch("https://slack.com/api/oauth.v2.access", {
		method: "POST",
		headers: { "content-type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams({
			client_id: clientId,
			client_secret: clientSecret,
			code,
			redirect_uri: getRedirectUri("slack"),
		}),
	});
	const data = (await res.json()) as {
		ok: boolean;
		error?: string;
		team?: { name?: string };
		incoming_webhook?: { url?: string; channel?: string };
	};
	if (!data.ok) throw new Error(`Slack: ${data.error ?? "unknown error"}`);

	const webhookUrl = data.incoming_webhook?.url;
	if (!webhookUrl) {
		throw new Error(
			"Slack didn't return an incoming webhook URL — was the incoming-webhook scope granted?",
		);
	}
	return {
		label: `${data.team?.name ?? "Slack"} · ${data.incoming_webhook?.channel ?? "channel"}`,
		webhookUrl,
	};
}

/** Exchanges Discord's OAuth code for the webhook it granted. Same as Slack, the webhook URL is in this response directly. */
export async function exchangeDiscordCode(
	code: string,
): Promise<ExchangeResult> {
	const clientId = process.env.DISCORD_CLIENT_ID;
	const clientSecret = process.env.DISCORD_CLIENT_SECRET;
	if (!clientId || !clientSecret)
		throw new Error("Discord OAuth is not configured");

	const res = await fetch("https://discord.com/api/oauth2/token", {
		method: "POST",
		headers: { "content-type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams({
			client_id: clientId,
			client_secret: clientSecret,
			grant_type: "authorization_code",
			code,
			redirect_uri: getRedirectUri("discord"),
		}),
	});
	if (!res.ok) throw new Error(`Discord: ${res.status} ${await res.text()}`);
	const data = (await res.json()) as {
		webhook?: { url?: string; name?: string };
	};

	const webhookUrl = data.webhook?.url;
	if (!webhookUrl) {
		throw new Error(
			"Discord didn't return a webhook — was the webhook.incoming scope granted?",
		);
	}
	return {
		label: `Discord · #${data.webhook?.name ?? "webhook"}`,
		webhookUrl,
	};
}

/** One connection per (org, provider) — connecting again replaces the previous webhook. */
export async function saveIntegration(
	organizationId: string,
	provider: IntegrationProvider,
	result: ExchangeResult,
): Promise<void> {
	const encryptedWebhookUrl = encryptSecret(result.webhookUrl);
	await db
		.insert(integrations)
		.values({
			organizationId,
			provider,
			label: result.label,
			encryptedWebhookUrl,
		})
		.onConflictDoUpdate({
			target: [integrations.organizationId, integrations.provider],
			set: { label: result.label, encryptedWebhookUrl },
		});
}

export async function deleteIntegration(
	organizationId: string,
	provider: IntegrationProvider,
): Promise<void> {
	await db
		.delete(integrations)
		.where(
			and(
				eq(integrations.organizationId, organizationId),
				eq(integrations.provider, provider),
			),
		);
}
