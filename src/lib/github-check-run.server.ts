import { getInstallationToken } from "@/lib/github-app.server";
import type { PrStatus } from "@/lib/mock-data";

/** The name the check shows under in a pull request, and the one to mark as required. */
export const CHECK_NAME = "Vitalgate";

const TIMEOUT_MS = 5000;

const CONCLUSION: Record<
	PrStatus,
	{ conclusion: "success" | "failure"; title: string }
> = {
	failing: { conclusion: "failure", title: "A required budget was exceeded" },
	warning: { conclusion: "success", title: "Passed with warnings" },
	passing: { conclusion: "success", title: "All budgets passed" },
};

/**
 * Reports a run's result as a completed "Vitalgate" check on the pull
 * request's head commit, as the GitHub App. This is what branch protection
 * should require: the workflow job itself then only fails when the audit
 * couldn't run, not when a budget is exceeded.
 *
 * Returns false instead of throwing, so /api/ingest can fall back to failing
 * the workflow job.
 */
export async function createCheckRun(opts: {
	installationId: string;
	repoFullName: string;
	headSha: string;
	status: PrStatus;
	/** Markdown results table (the same one posted as the PR comment). */
	summary: string;
	detailsUrl: string;
}): Promise<boolean> {
	try {
		const token = await getInstallationToken(opts.installationId);
		const { conclusion, title } = CONCLUSION[opts.status];
		const res = await fetch(
			`https://api.github.com/repos/${opts.repoFullName}/check-runs`,
			{
				method: "POST",
				headers: {
					authorization: `Bearer ${token}`,
					accept: "application/vnd.github+json",
					"content-type": "application/json",
					"x-github-api-version": "2022-11-28",
				},
				body: JSON.stringify({
					name: CHECK_NAME,
					head_sha: opts.headSha,
					status: "completed",
					conclusion,
					details_url: opts.detailsUrl,
					// GitHub caps the summary at 65535 characters.
					output: { title, summary: opts.summary.slice(0, 65_000) },
				}),
				signal: AbortSignal.timeout(TIMEOUT_MS),
			},
		);
		if (!res.ok) {
			console.error(
				`Creating the check run failed: ${res.status} ${(await res.text()).slice(0, 200)}`,
			);
		}
		return res.ok;
	} catch (err) {
		console.error("Creating the check run failed:", err);
		return false;
	}
}
