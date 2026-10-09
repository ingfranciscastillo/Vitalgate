import { createHmac, timingSafeEqual } from "node:crypto";

// Wide enough that a slow OAuth consent screen doesn't expire it, tight
// enough that a leaked/logged callback URL isn't replayable for long.
const STATE_TTL_MS = 10 * 60 * 1000;

function getSecret(): string {
	const secret = process.env.BETTER_AUTH_SECRET;
	if (!secret) throw new Error("BETTER_AUTH_SECRET is not set");
	return secret;
}

/**
 * A stateless, HMAC-signed OAuth `state` param carrying the organization
 * that started the flow — no server-side session/cookie storage needed
 * across the redirect to Slack/Discord and back.
 */
export function signOAuthState(
	organizationId: string,
	/** Optional short tag (no dots) the callback reads back, e.g. where to return to. */
	tag = "",
): string {
	const payload = `${organizationId}.${Date.now()}.${tag}`;
	const sig = createHmac("sha256", getSecret())
		.update(payload)
		.digest("base64url");
	return `${Buffer.from(payload, "utf8").toString("base64url")}.${sig}`;
}

/** Returns the organizationId if `state` is authentic and unexpired, otherwise null. */
export function verifyOAuthState(state: string): string | null {
	return verifyOAuthStatePayload(state)?.organizationId ?? null;
}

/** Like verifyOAuthState, plus the tag it was signed with ("" if none). */
export function verifyOAuthStatePayload(
	state: string,
): { organizationId: string; tag: string } | null {
	const [payloadB64, sig] = state.split(".");
	if (!payloadB64 || !sig) return null;

	const payload = Buffer.from(payloadB64, "base64url").toString("utf8");
	const expectedSig = createHmac("sha256", getSecret())
		.update(payload)
		.digest("base64url");
	const sigBuf = Buffer.from(sig);
	const expectedBuf = Buffer.from(expectedSig);
	if (
		sigBuf.length !== expectedBuf.length ||
		!timingSafeEqual(sigBuf, expectedBuf)
	) {
		return null;
	}

	const [organizationId, tsRaw, tag = ""] = payload.split(".");
	const ts = Number(tsRaw);
	if (
		!organizationId ||
		!Number.isFinite(ts) ||
		Date.now() - ts > STATE_TTL_MS
	) {
		return null;
	}
	return { organizationId, tag };
}
