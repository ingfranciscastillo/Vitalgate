import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { isValidWebhookSignature } from "@/lib/github-webhook.server";
import {
	signOAuthState,
	verifyOAuthState,
	verifyOAuthStatePayload,
} from "@/lib/oauth-state.server";

describe("isValidWebhookSignature", () => {
	const body = '{"action":"deleted"}';
	const sign = (raw: string) =>
		`sha256=${createHmac("sha256", "test-webhook-secret").update(raw).digest("hex")}`;

	it("accepts GitHub's HMAC of the exact body", () => {
		expect(isValidWebhookSignature(body, sign(body))).toBe(true);
	});

	it("rejects a missing, malformed or wrong signature", () => {
		expect(isValidWebhookSignature(body, null)).toBe(false);
		expect(isValidWebhookSignature(body, "deadbeef")).toBe(false);
		expect(isValidWebhookSignature(body, "sha256=deadbeef")).toBe(false);
	});

	it("rejects a signature for a different body", () => {
		expect(isValidWebhookSignature(`${body} `, sign(body))).toBe(false);
	});
});

describe("OAuth state", () => {
	afterEach(() => vi.useRealTimers());

	it("round-trips the organization and tag", () => {
		const state = signOAuthState("org123", "connect");
		expect(verifyOAuthState(state)).toBe("org123");
		expect(verifyOAuthStatePayload(state)).toEqual({
			organizationId: "org123",
			tag: "connect",
		});
	});

	it("defaults the tag to an empty string", () => {
		expect(verifyOAuthStatePayload(signOAuthState("org123"))?.tag).toBe("");
	});

	it("rejects a state whose payload was swapped", () => {
		const [, sig] = signOAuthState("org123").split(".");
		const otherPayload = signOAuthState("victim-org").split(".")[0];
		expect(verifyOAuthState(`${otherPayload}.${sig}`)).toBeNull();
	});

	it("expires after 10 minutes", () => {
		vi.useFakeTimers();
		const state = signOAuthState("org123");
		vi.advanceTimersByTime(11 * 60 * 1000);
		expect(verifyOAuthState(state)).toBeNull();
	});

	it("rejects garbage", () => {
		expect(verifyOAuthState("nope")).toBeNull();
		expect(verifyOAuthState("")).toBeNull();
	});
});
