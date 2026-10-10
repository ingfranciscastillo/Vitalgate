import { createPublicKey, type KeyObject, verify } from "node:crypto";

/**
 * Verifies the OIDC token a GitHub Actions run requests for itself (the
 * workflow has `permissions: id-token: write`). GitHub signs it, and its
 * claims say which repository and which pull request the run is for — so
 * /api/ingest learns where results come from without any secret stored in
 * the repo, and without trusting anything the workflow puts in its body.
 */

export const GITHUB_OIDC_ISSUER = "https://token.actions.githubusercontent.com";
const JWKS_URL = `${GITHUB_OIDC_ISSUER}/.well-known/jwks`;
/** Tolerated clock difference between GitHub and this server. */
const CLOCK_SKEW_S = 60;

export interface GithubOidcClaims {
	/** GitHub's numeric repository id, as a string. */
	repository_id: string;
	/** "owner/name" */
	repository: string;
	event_name: string;
	/** For pull_request runs: "refs/pull/<number>/merge". */
	ref: string;
	/** The commit the run is for (for deployment_status runs, the deployed commit). */
	sha: string;
}

type JwksFetcher = () => Promise<{ keys: (JsonWebKey & { kid?: string })[] }>;

// GitHub rotates signing keys rarely; refetch at most hourly, or right away
// when a token names a key id we haven't seen.
let jwksCache: { keys: Map<string, KeyObject>; fetchedAt: number } | null =
	null;
const JWKS_TTL_MS = 60 * 60 * 1000;

const fetchGithubJwks: JwksFetcher = async () => {
	const res = await fetch(JWKS_URL, { signal: AbortSignal.timeout(5000) });
	if (!res.ok) throw new Error(`GitHub JWKS responded ${res.status}`);
	return res.json();
};

async function getSigningKey(
	kid: string,
	fetchJwks: JwksFetcher,
): Promise<KeyObject | undefined> {
	const fresh = jwksCache && Date.now() - jwksCache.fetchedAt < JWKS_TTL_MS;
	if (fresh && jwksCache?.keys.has(kid)) return jwksCache.keys.get(kid);

	const { keys } = await fetchJwks();
	jwksCache = {
		fetchedAt: Date.now(),
		keys: new Map(
			keys
				.filter((k) => k.kid && k.kty === "RSA")
				.map((k) => [
					k.kid as string,
					createPublicKey({ key: k, format: "jwk" }),
				]),
		),
	};
	return jwksCache.keys.get(kid);
}

function decodePart(part: string): Record<string, unknown> {
	return JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
}

/**
 * Returns the token's claims if it's a valid GitHub Actions OIDC token meant
 * for `audience` (our own origin), or null. Never throws on a bad token.
 */
export async function verifyGithubOidcToken(
	token: string,
	audience: string,
	fetchJwks: JwksFetcher = fetchGithubJwks,
): Promise<GithubOidcClaims | null> {
	try {
		const [headerB64, payloadB64, signatureB64] = token.split(".");
		if (!headerB64 || !payloadB64 || !signatureB64) return null;

		const header = decodePart(headerB64);
		if (header.alg !== "RS256" || typeof header.kid !== "string") return null;

		const key = await getSigningKey(header.kid, fetchJwks);
		if (!key) return null;
		const valid = verify(
			"RSA-SHA256",
			Buffer.from(`${headerB64}.${payloadB64}`),
			key,
			Buffer.from(signatureB64, "base64url"),
		);
		if (!valid) return null;

		const claims = decodePart(payloadB64);
		const now = Math.floor(Date.now() / 1000);
		const audOk = Array.isArray(claims.aud)
			? claims.aud.includes(audience)
			: claims.aud === audience;
		if (
			claims.iss !== GITHUB_OIDC_ISSUER ||
			!audOk ||
			typeof claims.exp !== "number" ||
			claims.exp + CLOCK_SKEW_S < now ||
			(typeof claims.nbf === "number" && claims.nbf - CLOCK_SKEW_S > now) ||
			typeof claims.repository_id !== "string" ||
			typeof claims.repository !== "string" ||
			typeof claims.event_name !== "string" ||
			typeof claims.ref !== "string" ||
			typeof claims.sha !== "string"
		) {
			return null;
		}
		return {
			repository_id: claims.repository_id,
			repository: claims.repository,
			event_name: claims.event_name,
			ref: claims.ref,
			sha: claims.sha,
		};
	} catch {
		return null;
	}
}

/** The pull request number a pull_request run is for, from its ref ("refs/pull/12/merge"). */
export function pullNumberFromRef(ref: string): number | null {
	const match = /^refs\/pull\/(\d+)\/(merge|head)$/.exec(ref);
	return match ? Number(match[1]) : null;
}
