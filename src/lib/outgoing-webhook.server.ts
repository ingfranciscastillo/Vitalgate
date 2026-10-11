import {
	createHmac,
	randomBytes,
	randomUUID,
	timingSafeEqual,
} from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import type {
	AlertContext,
	AlertLinks,
	AlertToDeliver,
} from "@/lib/alert-messages";

/**
 * Outgoing webhooks: Vitalgate POSTs each run's alerts as JSON to a URL the
 * workspace chose, signed so the receiver can check it came from us.
 *
 * Signature: `X-Vitalgate-Signature: v1=<hex>`, the HMAC-SHA256 of
 * `<X-Vitalgate-Timestamp>.<raw body>` with the workspace's signing secret.
 * Receivers should also reject timestamps older than a few minutes.
 */

export type WebhookEvent = "alerts.created" | "ping";

export function newSigningSecret(): string {
	return `whsec_${randomBytes(32).toString("base64url")}`;
}

export function signWebhook(
	secret: string,
	timestamp: number,
	body: string,
): string {
	return `v1=${createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex")}`;
}

/** Receiver-side check, also used by our tests. Constant-time compare. */
export function verifyWebhook(
	secret: string,
	timestamp: number,
	body: string,
	signature: string,
): boolean {
	const expected = Buffer.from(signWebhook(secret, timestamp, body));
	const given = Buffer.from(signature);
	return expected.length === given.length && timingSafeEqual(expected, given);
}

export function alertsPayload(
	alerts: AlertToDeliver[],
	ctx: AlertContext,
	links: AlertLinks,
) {
	return {
		type: "alerts.created" as const,
		created_at: new Date().toISOString(),
		workspace_id: ctx.organizationId,
		repository: { full_name: ctx.repoFullName },
		pull_request: {
			number: ctx.prNumber,
			title: ctx.prTitle,
			author: ctx.prAuthor,
			url: links.pr,
		},
		vitalgate_url: links.app,
		alerts: alerts.map((a) => ({
			level: a.level,
			title: a.title,
			message: a.message,
		})),
	};
}

export function pingPayload(workspaceId: string) {
	return {
		type: "ping" as const,
		created_at: new Date().toISOString(),
		workspace_id: workspaceId,
		message: "Test event from Vitalgate. Your webhook is set up.",
	};
}

/** The request Vitalgate sends: body plus headers, ready for fetch. */
export function buildWebhookRequest(
	secret: string,
	event: WebhookEvent,
	payload: object,
	deliveryId: string,
	now = Date.now(),
) {
	const body = JSON.stringify(payload);
	const timestamp = Math.floor(now / 1000);
	return {
		body,
		headers: {
			"content-type": "application/json",
			"user-agent": "Vitalgate-Webhooks/1.0",
			"x-vitalgate-event": event,
			"x-vitalgate-delivery": deliveryId,
			"x-vitalgate-timestamp": String(timestamp),
			"x-vitalgate-signature": signWebhook(secret, timestamp, body),
		},
	};
}

/** Whether an IP literal is loopback, private, link-local or otherwise not on the public internet. */
export function isPrivateAddress(address: string): boolean {
	const version = isIP(address);
	if (version === 4) {
		const [a, b] = address.split(".").map(Number);
		return (
			a === 0 ||
			a === 10 ||
			a === 127 ||
			(a === 100 && b >= 64 && b <= 127) ||
			(a === 169 && b === 254) ||
			(a === 172 && b >= 16 && b <= 31) ||
			(a === 192 && b === 168) ||
			a >= 224
		);
	}
	if (version === 6) {
		const v = address.toLowerCase();
		if (v.startsWith("::ffff:")) return isPrivateAddress(v.slice(7));
		return (
			v === "::" ||
			v === "::1" ||
			v.startsWith("fc") ||
			v.startsWith("fd") ||
			v.startsWith("fe80")
		);
	}
	return false;
}

/**
 * First-pass check of a webhook URL a user typed: https, a real hostname,
 * no credentials, not an internal name or private IP literal. The server
 * also resolves the hostname before each delivery (see the .server module).
 */
export function checkWebhookUrl(input: string): URL | string {
	let url: URL;
	try {
		url = new URL(input.trim());
	} catch {
		return "Enter a full URL, like https://example.com/hooks/vitalgate";
	}
	if (url.protocol !== "https:") return "The URL must start with https://";
	if (url.username || url.password) {
		return "Remove the username and password from the URL";
	}
	const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
	if (
		host === "localhost" ||
		host.endsWith(".localhost") ||
		host.endsWith(".local") ||
		host.endsWith(".internal") ||
		(isIP(host) !== 0 && isPrivateAddress(host)) ||
		(isIP(host) === 0 && !host.includes("."))
	) {
		return "That address isn't reachable from the internet";
	}
	return url;
}

const SEND_TIMEOUT_MS = 5000;

/**
 * POSTs one event. The hostname is resolved first and every address must be
 * public — a name can point anywhere, including our own network — and
 * redirects aren't followed. Resolves to the HTTP status; throws on network
 * errors and blocked addresses.
 */
export async function sendWebhook(opts: {
	url: string;
	secret: string;
	event: WebhookEvent;
	payload: object;
}): Promise<number> {
	const checked = checkWebhookUrl(opts.url);
	if (typeof checked === "string") throw new Error(checked);
	const host = checked.hostname.replace(/^\[|\]$/g, "");
	const addresses =
		isIP(host) !== 0
			? [host]
			: (await lookup(host, { all: true })).map((a) => a.address);
	if (addresses.length === 0 || addresses.some(isPrivateAddress)) {
		throw new Error("That address isn't reachable from the internet");
	}

	const req = buildWebhookRequest(
		opts.secret,
		opts.event,
		opts.payload,
		`dlv_${randomUUID()}`,
	);
	const res = await fetch(checked, {
		method: "POST",
		headers: req.headers,
		body: req.body,
		redirect: "manual",
		signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
	});
	return res.status;
}
