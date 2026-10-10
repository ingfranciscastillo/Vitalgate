import { createHmac, timingSafeEqual } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { githubInstallations, repos } from "@/db/schema";

/**
 * True when `signature` (the X-Hub-Signature-256 header, "sha256=<hex>") is
 * GitHub's HMAC of the exact raw body with our webhook secret. Anything that
 * fails this is not from GitHub and must be ignored.
 */
export function isValidWebhookSignature(
	rawBody: string,
	signature: string | null,
): boolean {
	const secret = process.env.GITHUB_APP_WEBHOOK_SECRET;
	if (!secret || !signature?.startsWith("sha256=")) return false;
	const expected = Buffer.from(
		`sha256=${createHmac("sha256", secret).update(rawBody).digest("hex")}`,
	);
	const given = Buffer.from(signature);
	return given.length === expected.length && timingSafeEqual(given, expected);
}

interface WebhookRepo {
	id: number;
	name: string;
	full_name: string;
	default_branch?: string;
}

interface WebhookPayload {
	action?: string;
	installation?: { id: number };
	repositories_removed?: WebhookRepo[];
	repository?: WebhookRepo;
	changes?: { default_branch?: { from: string } };
}

/** Removes repos from Vitalgate (cascading to their budgets, PR history and alerts), as disconnecting does. */
async function disconnectRepos(githubRepoIds: string[]): Promise<number> {
	if (githubRepoIds.length === 0) return 0;
	const removed = await db
		.delete(repos)
		.where(inArray(repos.githubRepoId, githubRepoIds))
		.returning({ id: repos.id });
	return removed.length;
}

/**
 * Keeps Vitalgate in step with changes made on GitHub's side. Returns a short
 * description of what changed, for the response and logs.
 */
export async function handleWebhookEvent(
	event: string,
	payload: WebhookPayload,
): Promise<string> {
	const installationId = payload.installation
		? String(payload.installation.id)
		: null;

	// The app was uninstalled: its tokens stop working, so nothing it
	// covered can keep running.
	if (
		event === "installation" &&
		payload.action === "deleted" &&
		installationId
	) {
		const removedRepos = await db
			.delete(repos)
			.where(eq(repos.installationId, installationId))
			.returning({ id: repos.id });
		await db
			.delete(githubInstallations)
			.where(eq(githubInstallations.installationId, installationId));
		return `installation ${installationId} removed, ${removedRepos.length} repo(s) disconnected`;
	}

	// Repositories were taken away from the installation.
	if (
		event === "installation_repositories" &&
		payload.action === "removed" &&
		installationId
	) {
		const ids = (payload.repositories_removed ?? []).map((r) => String(r.id));
		const removed = ids.length
			? await db
					.delete(repos)
					.where(
						and(
							eq(repos.installationId, installationId),
							inArray(repos.githubRepoId, ids),
						),
					)
					.returning({ id: repos.id })
			: [];
		return `${removed.length} repo(s) disconnected`;
	}

	if (event === "repository" && payload.repository) {
		const repo = payload.repository;
		const githubRepoId = String(repo.id);

		if (payload.action === "deleted") {
			return `${await disconnectRepos([githubRepoId])} repo(s) disconnected`;
		}
		if (payload.action === "renamed" || payload.action === "transferred") {
			const updated = await db
				.update(repos)
				.set({ name: repo.name, fullName: repo.full_name })
				.where(eq(repos.githubRepoId, githubRepoId))
				.returning({ id: repos.id });
			return updated.length ? `renamed to ${repo.full_name}` : "not connected";
		}
		if (
			payload.action === "edited" &&
			payload.changes?.default_branch &&
			repo.default_branch
		) {
			const updated = await db
				.update(repos)
				.set({ defaultBranch: repo.default_branch })
				.where(eq(repos.githubRepoId, githubRepoId))
				.returning({ id: repos.id });
			return updated.length
				? `default branch is now ${repo.default_branch}`
				: "not connected";
		}
	}

	return "ignored";
}
