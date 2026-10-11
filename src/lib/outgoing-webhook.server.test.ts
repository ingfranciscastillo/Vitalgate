import { describe, expect, it } from "vitest";
import {
	buildWebhookRequest,
	checkWebhookUrl,
	isPrivateAddress,
	pingPayload,
	verifyWebhook,
} from "@/lib/outgoing-webhook.server";

describe("webhook signing", () => {
	it("signs timestamp.body so the receiver can verify it", () => {
		const req = buildWebhookRequest(
			"whsec_test",
			"ping",
			pingPayload("org_1"),
			"dlv_1",
			1_760_000_000_000,
		);
		expect(req.headers["x-vitalgate-timestamp"]).toBe("1760000000");
		expect(
			verifyWebhook(
				"whsec_test",
				1_760_000_000,
				req.body,
				req.headers["x-vitalgate-signature"],
			),
		).toBe(true);
		expect(
			verifyWebhook(
				"whsec_other",
				1_760_000_000,
				req.body,
				req.headers["x-vitalgate-signature"],
			),
		).toBe(false);
		expect(
			verifyWebhook(
				"whsec_test",
				1_760_000_000,
				`${req.body} `,
				req.headers["x-vitalgate-signature"],
			),
		).toBe(false);
	});
});

describe("webhook URL checks", () => {
	it("accepts public https URLs", () => {
		expect(
			checkWebhookUrl("https://hooks.example.com/vitalgate"),
		).toBeInstanceOf(URL);
	});

	it("rejects plain http, credentials and internal hosts", () => {
		for (const bad of [
			"http://hooks.example.com",
			"https://user:pass@hooks.example.com",
			"https://localhost/x",
			"https://127.0.0.1/x",
			"https://169.254.169.254/latest/meta-data",
			"https://10.0.0.5/x",
			"https://[::1]/x",
			"https://intranet/x",
			"https://db.internal/x",
			"not a url",
		]) {
			expect(typeof checkWebhookUrl(bad)).toBe("string");
		}
	});

	it("knows private and public addresses", () => {
		expect(isPrivateAddress("192.168.1.10")).toBe(true);
		expect(isPrivateAddress("172.20.0.1")).toBe(true);
		expect(isPrivateAddress("::ffff:10.1.2.3")).toBe(true);
		expect(isPrivateAddress("fd12::1")).toBe(true);
		expect(isPrivateAddress("8.8.8.8")).toBe(false);
		expect(isPrivateAddress("2606:4700::1111")).toBe(false);
	});
});
