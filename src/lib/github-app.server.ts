import { createPrivateKey, type KeyObject, sign } from "node:crypto";

/**
 * Server-side access to the Vitalgate GitHub App: app-level JWTs and
 * per-installation access tokens. Installation tokens act as the app
 * ("Vitalgate[bot]"), only on the repos the installing account granted, with
 * only the app's permissions — unlike the user's OAuth token.
 */

const GITHUB_API = "https://api.github.com";

interface AppConfig {
	appId: string;
	slug: string;
	privateKey: KeyObject;
}

let config: AppConfig | null = null;

function getConfig(): AppConfig {
	if (config) return config;
	const appId = process.env.GITHUB_APP_ID;
	const slug = process.env.GITHUB_APP_SLUG;
	const keyB64 = process.env.GITHUB_APP_PRIVATE_KEY;
	if (!appId || !slug || !keyB64) {
		throw new Error(
			"GitHub App is not configured: set GITHUB_APP_ID, GITHUB_APP_SLUG and GITHUB_APP_PRIVATE_KEY (the .pem file, base64-encoded).",
		);
	}
	config = {
		appId,
		slug,
		privateKey: createPrivateKey(
			Buffer.from(keyB64, "base64").toString("utf8"),
		),
	};
	return config;
}

export function isGithubAppConfigured(): boolean {
	return Boolean(
		process.env.GITHUB_APP_ID &&
			process.env.GITHUB_APP_SLUG &&
			process.env.GITHUB_APP_PRIVATE_KEY,
	);
}

/** Where to send a user to install the app; `state` comes back to the setup URL untouched. */
export function getInstallUrl(state: string): string {
	const params = new URLSearchParams({ state });
	return `https://github.com/apps/${getConfig().slug}/installations/new?${params}`;
}

/**
 * Short-lived JWT that authenticates as the app itself (not an
 * installation). iat is backdated a minute for clock drift, and GitHub
 * rejects anything valid for more than 10 minutes.
 */
function createAppJwt(): string {
	const { appId, privateKey } = getConfig();
	const now = Math.floor(Date.now() / 1000);
	const encode = (part: object) =>
		Buffer.from(JSON.stringify(part)).toString("base64url");
	const unsigned = `${encode({ alg: "RS256", typ: "JWT" })}.${encode({
		iat: now - 60,
		exp: now + 9 * 60,
		iss: appId,
	})}`;
	const signature = sign("RSA-SHA256", Buffer.from(unsigned), privateKey);
	return `${unsigned}.${signature.toString("base64url")}`;
}

async function githubAsApp<T>(
	path: string,
	init: RequestInit = {},
): Promise<T> {
	const res = await fetch(`${GITHUB_API}${path}`, {
		...init,
		headers: {
			authorization: `Bearer ${createAppJwt()}`,
			accept: "application/vnd.github+json",
			"x-github-api-version": "2022-11-28",
			...init.headers,
		},
	});
	if (!res.ok) {
		throw new Error(`GitHub App API ${path} responded ${res.status}`);
	}
	return (await res.json()) as T;
}

export interface InstallationInfo {
	id: number;
	account: { id: number; login: string; type: "User" | "Organization" };
}

/** The installation as GitHub reports it — the trusted source for which account it belongs to. */
export function getInstallation(
	installationId: string,
): Promise<InstallationInfo> {
	return githubAsApp<InstallationInfo>(
		`/app/installations/${encodeURIComponent(installationId)}`,
	);
}

// Installation tokens last an hour; reuse one until shortly before then.
const tokenCache = new Map<string, { token: string; expiresAt: number }>();
const REFRESH_MARGIN_MS = 5 * 60 * 1000;

/** An access token acting as the app on one installation's repos. */
export async function getInstallationToken(
	installationId: string,
): Promise<string> {
	const cached = tokenCache.get(installationId);
	if (cached && cached.expiresAt - REFRESH_MARGIN_MS > Date.now()) {
		return cached.token;
	}
	const { token, expires_at } = await githubAsApp<{
		token: string;
		expires_at: string;
	}>(`/app/installations/${encodeURIComponent(installationId)}/access_tokens`, {
		method: "POST",
	});
	tokenCache.set(installationId, {
		token,
		expiresAt: new Date(expires_at).getTime(),
	});
	return token;
}
