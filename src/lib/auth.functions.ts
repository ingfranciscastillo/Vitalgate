import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { parseInput } from "@/lib/validation";

export const getSession = createServerFn({ method: "GET" }).handler(
	async () => {
		const headers = getRequestHeaders();
		const session = await auth.api.getSession({ headers });

		return session;
	},
);

export const ensureSession = createServerFn({ method: "GET" }).handler(
	async () => {
		const headers = getRequestHeaders();
		const session = await auth.api.getSession({ headers });

		if (!session) {
			throw new Error("Unauthorized");
		}

		return session;
	},
);

/**
 * Every current user signed up via GitHub, so none of them has a credential
 * (email+password) account yet — better-auth's own changePassword requires
 * one to already exist (it verifies currentPassword against it) and throws
 * CREDENTIAL_ACCOUNT_NOT_FOUND otherwise. setPassword handles that "no
 * password yet" case by linking one, but it's server-only
 * (createAuthEndpoint.serverOnly) — not reachable from the browser, hence
 * this wrapper. Once a user has done this once, authClient.changePassword
 * works directly and doesn't need this.
 */
export const setInitialPassword = createServerFn({ method: "POST" })
	.validator(parseInput(z.object({ newPassword: z.string().min(8).max(128) })))
	.handler(async ({ data }) => {
		const headers = getRequestHeaders();
		try {
			await auth.api.setPassword({
				body: { newPassword: data.newPassword },
				headers,
			});
		} catch (err) {
			throw new Error(
				err instanceof Error ? err.message : "Could not set password",
			);
		}
	});
