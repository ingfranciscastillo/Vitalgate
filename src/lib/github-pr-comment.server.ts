import { getAppBotLogin, getInstallationToken } from "@/lib/github-app.server";
import { PR_COMMENT_MARKER } from "@/lib/pr-comment";

/** How long each GitHub call may take; the ingest response waits on these. */
const TIMEOUT_MS = 5000;

/**
 * Posts the results comment on a pull request as the GitHub App, or updates
 * the app's previous one so a PR keeps a single Vitalgate comment. Works on
 * PRs from forks too (the comment lives on the base repo, where the app is
 * installed) — unlike the workflow's own GITHUB_TOKEN, which is read-only
 * there.
 *
 * Returns false instead of throwing, so /api/ingest can hand the comment to
 * the workflow to post itself as a fallback.
 */
export async function upsertPrCommentAsApp(opts: {
	installationId: string;
	repoFullName: string;
	prNumber: number;
	body: string;
}): Promise<boolean> {
	try {
		const token = await getInstallationToken(opts.installationId);
		const headers = {
			authorization: `Bearer ${token}`,
			accept: "application/vnd.github+json",
			"content-type": "application/json",
			"x-github-api-version": "2022-11-28",
		};
		const issues = `https://api.github.com/repos/${opts.repoFullName}/issues`;

		const listRes = await fetch(
			`${issues}/${opts.prNumber}/comments?per_page=100`,
			{ headers, signal: AbortSignal.timeout(TIMEOUT_MS) },
		);
		if (!listRes.ok) return false;
		const comments = (await listRes.json()) as {
			id: number;
			body?: string;
			user?: { login?: string };
		}[];
		// Only the app's own comment — never edit a human's that happens to
		// quote the marker.
		const botLogin = getAppBotLogin();
		const previous = comments.find(
			(c) => c.user?.login === botLogin && c.body?.includes(PR_COMMENT_MARKER),
		);

		const res = await fetch(
			previous
				? `${issues}/comments/${previous.id}`
				: `${issues}/${opts.prNumber}/comments`,
			{
				method: previous ? "PATCH" : "POST",
				headers,
				body: JSON.stringify({ body: opts.body }),
				signal: AbortSignal.timeout(TIMEOUT_MS),
			},
		);
		return res.ok;
	} catch (err) {
		console.error("Posting the PR comment as the GitHub App failed:", err);
		return false;
	}
}
