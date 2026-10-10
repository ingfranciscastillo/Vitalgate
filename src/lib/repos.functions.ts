import { createServerFn } from "@tanstack/react-start";
import { count, eq, max, sql } from "drizzle-orm";
import { db } from "@/db";
import { pullRequests, repos } from "@/db/schema";
import { ensureSession } from "@/lib/auth.functions";

export interface RepoListItem {
	id: string;
	/** GitHub's numeric repo id, as text. */
	githubRepoId: string;
	fullName: string;
	defaultBranch: string;
	/** Total PRs Vitalgate has recorded audits for (it doesn't track whether they're open or closed). */
	prCount: number;
	lastRunAt: string | null;
	/** Average Performance Score across recorded PRs, or null if there are none yet. */
	avgPerf: number | null;
	/** Count of this repo's PRs currently in a failing state (latest run per PR, not a historical count). */
	failingCount: number;
}

export const getOrgRepos = createServerFn({ method: "GET" }).handler(
	async (): Promise<RepoListItem[]> => {
		const session = await ensureSession();
		const organizationId = session.session.activeOrganizationId;
		if (!organizationId) return [];

		const rows = await db
			.select({
				id: repos.id,
				githubRepoId: repos.githubRepoId,
				fullName: repos.fullName,
				defaultBranch: repos.defaultBranch,
				prCount: count(pullRequests.id),
				lastRunAt: max(pullRequests.openedAt),
				avgPerf: sql<
					string | null
				>`avg((${pullRequests.metrics}->>'PERF')::numeric)`,
				failingCount: sql<string>`count(*) filter (where ${pullRequests.status} = 'failing')`,
			})
			.from(repos)
			.leftJoin(pullRequests, eq(pullRequests.repoId, repos.id))
			.where(eq(repos.organizationId, organizationId))
			.groupBy(repos.id)
			.orderBy(repos.fullName);

		return rows.map((r) => ({
			id: r.id,
			githubRepoId: r.githubRepoId,
			fullName: r.fullName,
			defaultBranch: r.defaultBranch,
			prCount: Number(r.prCount),
			lastRunAt: r.lastRunAt ? new Date(r.lastRunAt).toISOString() : null,
			avgPerf: r.avgPerf != null ? Math.round(Number(r.avgPerf)) : null,
			failingCount: Number(r.failingCount),
		}));
	},
);
