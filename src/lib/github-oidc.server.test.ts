import { generateKeyPairSync, sign } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
	GITHUB_OIDC_ISSUER,
	pullNumberFromRef,
	verifyGithubOidcToken,
} from "@/lib/github-oidc.server";

const AUDIENCE = "https://vitalgate.example";
const { publicKey, privateKey } = generateKeyPairSync("rsa", {
	modulusLength: 2048,
});
const jwks = async () => ({
	keys: [{ ...publicKey.export({ format: "jwk" }), kid: "k1", alg: "RS256" }],
});

const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
const now = () => Math.floor(Date.now() / 1000);

function makeToken(claims: Record<string, unknown>, kid = "k1") {
	const unsigned = `${b64({ alg: "RS256", kid })}.${b64(claims)}`;
	const signature = sign("RSA-SHA256", Buffer.from(unsigned), privateKey);
	return `${unsigned}.${signature.toString("base64url")}`;
}

const validClaims = () => ({
	iss: GITHUB_OIDC_ISSUER,
	aud: AUDIENCE,
	exp: now() + 300,
	nbf: now() - 10,
	repository_id: "1357877390",
	repository: "acme/web",
	event_name: "pull_request",
	ref: "refs/pull/10/merge",
});

describe("verifyGithubOidcToken", () => {
	it("accepts a valid token and returns its claims", async () => {
		const claims = await verifyGithubOidcToken(
			makeToken(validClaims()),
			AUDIENCE,
			jwks,
		);
		expect(claims).toEqual({
			repository_id: "1357877390",
			repository: "acme/web",
			event_name: "pull_request",
			ref: "refs/pull/10/merge",
		});
	});

	it.each([
		["another audience", { aud: "https://evil.example" }],
		["another issuer", { iss: "https://evil.example" }],
		["an expired token", { exp: now() - 600 }],
		["a token not valid yet", { nbf: now() + 600 }],
		["missing repository_id", { repository_id: undefined }],
	])("rejects %s", async (_label, override) => {
		const token = makeToken({ ...validClaims(), ...override });
		expect(await verifyGithubOidcToken(token, AUDIENCE, jwks)).toBeNull();
	});

	it("rejects a token signed with an unknown key id", async () => {
		const token = makeToken(validClaims(), "other");
		expect(await verifyGithubOidcToken(token, AUDIENCE, jwks)).toBeNull();
	});

	it("rejects a token whose claims were changed after signing", async () => {
		const [header, , signature] = makeToken(validClaims()).split(".");
		const forged = `${header}.${b64({ ...validClaims(), repository_id: "1" })}.${signature}`;
		expect(await verifyGithubOidcToken(forged, AUDIENCE, jwks)).toBeNull();
	});

	it("rejects garbage without throwing", async () => {
		expect(await verifyGithubOidcToken("not.a.jwt", AUDIENCE, jwks)).toBeNull();
		expect(await verifyGithubOidcToken("", AUDIENCE, jwks)).toBeNull();
	});
});

describe("pullNumberFromRef", () => {
	it("reads the PR number from pull request refs", () => {
		expect(pullNumberFromRef("refs/pull/42/merge")).toBe(42);
		expect(pullNumberFromRef("refs/pull/7/head")).toBe(7);
	});

	it("returns null for anything else", () => {
		expect(pullNumberFromRef("refs/heads/main")).toBeNull();
		expect(pullNumberFromRef("refs/pull/abc/merge")).toBeNull();
	});
});
