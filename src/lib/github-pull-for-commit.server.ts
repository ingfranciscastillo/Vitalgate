import { getInstallationToken } from "@/lib/github-app.server";

export interface PullForCommit {
	number: number;
	title: string;
	author: string;
	branch: string;
	headSha: string;
}

/**
 * The open pull request whose head is `sha`, as the GitHub App sees it — how
 * a preview-deployment run (which only knows the deployed commit) is tied to
 * its PR. Null when the commit isn't the head of any open PR, e.g. a
 * deployment of a branch nobody opened a PR for.
 */
export async function findOpenPullForCommit(opts: {
	installationId: string;
	repoFullName: string;
	sha: string;
}): Promise<PullForCommit | null> {
	const token = await getInstallationToken(opts.installationId);
	const res = await fetch(
		`https://api.github.com/repos/${opts.repoFullName}/commits/${opts.sha}/pulls`,
		{
			headers: {
				authorization: `Bearer ${token}`,
				accept: "application/vnd.github+json",
				"x-github-api-version": "2022-11-28",
			},
			signal: AbortSignal.timeout(5000),
		},
	);
	if (!res.ok) throw new Error(`GitHub commits/pulls responded ${res.status}`);
	const pulls = (await res.json()) as {
		number: number;
		state: string;
		title: string;
		user: { login: string } | null;
		head: { ref: string; sha: string };
	}[];
	const pull = pulls.find((p) => p.state === "open" && p.head.sha === opts.sha);
	if (!pull) return null;
	return {
		number: pull.number,
		title: pull.title.slice(0, 256),
		author: (pull.user?.login ?? "unknown").slice(0, 39),
		branch: pull.head.ref.slice(0, 255),
		headSha: pull.head.sha,
	};
}
