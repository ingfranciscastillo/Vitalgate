import { timeAgo } from "@/lib/format";

export interface GhRepo {
	id: string;
	name: string;
	fullName: string;
	defaultBranch: string;
	private: boolean;
	stars: number;
	language: string;
	updated: string;
	org: string;
	/** The repo's "Website" field on GitHub, when it's an https URL. */
	homepage: string | null;
}

/** Shape of the fields we read from GitHub's REST API repo object. */
interface GithubApiRepo {
	id: number;
	name: string;
	full_name: string;
	default_branch: string;
	private: boolean;
	stargazers_count: number;
	language: string | null;
	pushed_at: string | null;
	owner: { login: string };
	homepage: string | null;
}

function mapRepo(r: GithubApiRepo): GhRepo {
	return {
		id: String(r.id),
		name: r.name,
		fullName: r.full_name,
		defaultBranch: r.default_branch,
		private: r.private,
		stars: r.stargazers_count,
		language: r.language ?? "Unknown",
		updated: timeAgo(r.pushed_at),
		org: r.owner.login,
		homepage: r.homepage?.startsWith("https://") ? r.homepage : null,
	};
}

/**
 * Lists the repos a GitHub App installation token was granted — exactly the
 * ones the installing account picked. Capped at 300 repos (3 pages); a
 * "load more" flow would be needed beyond that.
 */
export async function listInstallationRepos(
	installationToken: string,
): Promise<GhRepo[]> {
	const repos: GhRepo[] = [];
	for (let page = 1; page <= 3; page++) {
		const res = await fetch(
			`https://api.github.com/installation/repositories?per_page=100&page=${page}`,
			{
				headers: {
					Authorization: `Bearer ${installationToken}`,
					Accept: "application/vnd.github+json",
					"X-GitHub-Api-Version": "2022-11-28",
				},
			},
		);
		if (!res.ok) {
			throw new Error(`GitHub API error: ${res.status} ${await res.text()}`);
		}
		const body = (await res.json()) as { repositories: GithubApiRepo[] };
		repos.push(...body.repositories.map(mapRepo));
		if (body.repositories.length < 100) break;
	}
	return repos;
}

/** The subset of package.json fields the workflow generator cares about. */
export interface PackageJsonInfo {
	scripts: Record<string, string>;
	/** Corepack-style pin, e.g. "pnpm@9.12.4" or "yarn@4.5.0" — undefined if unset. */
	packageManager?: string;
}

/**
 * Reads and parses package.json from a repo's default branch. Returns null if
 * there's no package.json at the repo root, or it doesn't parse — not every
 * project is a root-level Node package (monorepos, non-JS projects), and the
 * caller falls back to a placeholder in that case.
 */
export async function getPackageJson(
	accessToken: string,
	fullName: string,
): Promise<PackageJsonInfo | null> {
	const res = await fetch(
		`https://api.github.com/repos/${fullName}/contents/package.json`,
		{
			headers: {
				Authorization: `Bearer ${accessToken}`,
				Accept: "application/vnd.github+json",
				"X-GitHub-Api-Version": "2022-11-28",
			},
		},
	);
	if (!res.ok) return null;

	try {
		const file = (await res.json()) as { content: string; encoding: string };
		if (file.encoding !== "base64") return null;
		const pkg = JSON.parse(
			Buffer.from(file.content, "base64").toString("utf8"),
		);
		if (!pkg || typeof pkg !== "object") return null;
		return {
			scripts: typeof pkg.scripts === "object" ? pkg.scripts : {},
			packageManager:
				typeof pkg.packageManager === "string" ? pkg.packageManager : undefined,
		};
	} catch {
		return null;
	}
}

/**
 * Picks which package.json script serves a production build, in the order a
 * user would actually reach for one: "start" (the Node/Next.js convention),
 * then "preview" (Vite/Astro's equivalent), then "serve". Returns null if
 * none of these are defined — the caller must fall back to a placeholder the
 * user fills in by hand.
 */
export function pickServeScript(
	scripts: Record<string, string>,
): string | null {
	for (const candidate of ["start", "preview", "serve"]) {
		if (scripts[candidate]) return candidate;
	}
	return null;
}

export type PackageManager = "pnpm" | "yarn" | "npm";

/**
 * Detects which package manager a repo actually uses, from its lockfile —
 * the one source of truth for "what will `install` actually run against"
 * (a project can have any tool's config lying around, but only one lockfile
 * is real). Defaults to npm when no lockfile is found, matching npm's own
 * behavior of working without one. One API call: list the repo root instead
 * of probing each lockfile path individually.
 */
export async function detectPackageManager(
	accessToken: string,
	fullName: string,
): Promise<PackageManager> {
	const res = await fetch(
		`https://api.github.com/repos/${fullName}/contents/`,
		{
			headers: {
				Authorization: `Bearer ${accessToken}`,
				Accept: "application/vnd.github+json",
				"X-GitHub-Api-Version": "2022-11-28",
			},
		},
	);
	if (!res.ok) return "npm";

	try {
		const entries = (await res.json()) as { name: string }[];
		const names = new Set(entries.map((e) => e.name));
		if (names.has("pnpm-lock.yaml")) return "pnpm";
		if (names.has("yarn.lock")) return "yarn";
		return "npm";
	} catch {
		return "npm";
	}
}

/**
 * Whether a repo's yarn.lock is Yarn Berry's format (v2+) rather than
 * Classic's (v1). The two are mutually incompatible — Classic can't read a
 * Berry lockfile or vice versa — and only Berry's lockfile carries a
 * "__metadata:" block, so sniffing the file itself is the reliable way to
 * tell them apart when the repo doesn't pin a version. Returns false
 * (Classic) on any fetch/parse failure, matching Corepack's own default.
 */
export async function isYarnBerryLockfile(
	accessToken: string,
	fullName: string,
): Promise<boolean> {
	const res = await fetch(
		`https://api.github.com/repos/${fullName}/contents/yarn.lock`,
		{
			headers: {
				Authorization: `Bearer ${accessToken}`,
				Accept: "application/vnd.github+json",
				"X-GitHub-Api-Version": "2022-11-28",
			},
		},
	);
	if (!res.ok) return false;

	try {
		const file = (await res.json()) as { content: string; encoding: string };
		if (file.encoding !== "base64") return false;
		const text = Buffer.from(file.content, "base64").toString("utf8");
		return text.includes("__metadata:");
	} catch {
		return false;
	}
}

export type CommitWorkflowResult =
	| { status: "created" }
	| { status: "updated" }
	| { status: "already-exists" }
	| { status: "error"; message: string };

/**
 * First line of every workflow Vitalgate generates. Lets commitWorkflowFile
 * tell "a file we generated, safe to regenerate on reconnect" apart from "the
 * user wrote their own workflow at this path, don't touch it".
 */
export const WORKFLOW_MANAGED_MARKER = "# Managed by Vitalgate.";

/** Where the workflow lives in a connected repo. */
const WORKFLOW_PATH = ".github/workflows/vitalgate.yml";

/**
 * Commits the Vitalgate GitHub Action workflow to a repo at WORKFLOW_PATH,
 * authored by the GitHub App (installation token). If a file already exists
 * there: overwrites it when it's one Vitalgate generated before (carries
 * WORKFLOW_MANAGED_MARKER — this is how reconnecting a repo picks up
 * template changes), otherwise leaves it alone so a user's own hand-written
 * workflow is never silently clobbered.
 */
export async function commitWorkflowFile(
	accessToken: string,
	fullName: string,
	content: string,
): Promise<CommitWorkflowResult> {
	const url = `https://api.github.com/repos/${fullName}/contents/${WORKFLOW_PATH}`;
	const headers = {
		Authorization: `Bearer ${accessToken}`,
		Accept: "application/vnd.github+json",
		"X-GitHub-Api-Version": "2022-11-28",
	};

	const existing = await fetch(url, { headers });
	let existingSha: string | undefined;
	if (existing.status === 200) {
		const file = (await existing.json()) as {
			content: string;
			encoding: string;
			sha: string;
		};
		const existingContent =
			file.encoding === "base64"
				? Buffer.from(file.content, "base64").toString("utf8")
				: "";
		if (!existingContent.startsWith(WORKFLOW_MANAGED_MARKER)) {
			return { status: "already-exists" };
		}
		existingSha = file.sha;
	} else if (existing.status !== 404) {
		return {
			status: "error",
			message: `GitHub API error checking for existing file: ${existing.status}`,
		};
	}

	const res = await fetch(url, {
		method: "PUT",
		headers: { ...headers, "content-type": "application/json" },
		body: JSON.stringify({
			message: existingSha
				? "Update Vitalgate performance budget workflow"
				: "Add Vitalgate performance budget workflow",
			content: Buffer.from(content, "utf8").toString("base64"),
			...(existingSha ? { sha: existingSha } : {}),
		}),
	});
	if (!res.ok) {
		return {
			status: "error",
			message: `GitHub API error: ${res.status} ${await res.text()}`,
		};
	}
	if (existingSha) return { status: "updated" };
	return { status: "created" };
}

/**
 * Removes the workflow file this app committed, as part of disconnecting a
 * repo — otherwise its next PR keeps calling /api/ingest and failing with
 * "not connected" instead of simply not running. Best-effort and silent:
 * only deletes when the file still carries WORKFLOW_MANAGED_MARKER (never a
 * user's own hand-written workflow at that path), and a missing file or a
 * token without access is treated the same as success — disconnecting from
 * Vitalgate's own side shouldn't fail just because GitHub cleanup couldn't.
 */
export async function deleteWorkflowFile(
	accessToken: string,
	fullName: string,
): Promise<void> {
	const url = `https://api.github.com/repos/${fullName}/contents/${WORKFLOW_PATH}`;
	const headers = {
		Authorization: `Bearer ${accessToken}`,
		Accept: "application/vnd.github+json",
		"X-GitHub-Api-Version": "2022-11-28",
	};

	try {
		const existing = await fetch(url, { headers });
		if (existing.status !== 200) return;

		const file = (await existing.json()) as {
			content: string;
			encoding: string;
			sha: string;
		};
		const content =
			file.encoding === "base64"
				? Buffer.from(file.content, "base64").toString("utf8")
				: "";
		if (!content.startsWith(WORKFLOW_MANAGED_MARKER)) return;

		await fetch(url, {
			method: "DELETE",
			headers: { ...headers, "content-type": "application/json" },
			body: JSON.stringify({
				message: "Remove Vitalgate performance budget workflow",
				sha: file.sha,
			}),
		});
	} catch {
		// Best-effort — see doc comment above.
	}
}
