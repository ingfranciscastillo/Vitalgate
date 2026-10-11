import { createFileRoute } from "@tanstack/react-router";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { pullRequests, repos } from "@/db/schema";
import { renderBadge } from "@/lib/badge";
import type { PrStatus } from "@/lib/mock-data";

/**
 * GET /api/badge?repo=owner/name: the README badge for a public repository
 * connected to Vitalgate, showing its latest audited pull request. Private
 * or unknown repositories get the neutral badge, so nothing about them
 * leaks.
 */
async function latestStatus(fullName: string): Promise<PrStatus | "none"> {
	if (!/^[\w.-]{1,100}\/[\w.-]{1,100}$/.test(fullName)) return "none";
	const [row] = await db
		.select({ status: pullRequests.status })
		.from(pullRequests)
		.innerJoin(repos, eq(repos.id, pullRequests.repoId))
		.where(and(eq(repos.fullName, fullName), eq(repos.private, false)))
		.orderBy(desc(pullRequests.openedAt))
		.limit(1);
	return row?.status ?? "none";
}

export const Route = createFileRoute("/api/badge")({
	server: {
		handlers: {
			GET: async ({ request }) => {
				const repo = new URL(request.url).searchParams.get("repo") ?? "";
				const status = await latestStatus(repo).catch(() => "none" as const);
				return new Response(renderBadge(status), {
					headers: {
						"content-type": "image/svg+xml; charset=utf-8",
						// GitHub's image proxy honours this; keep it fresh-ish.
						"cache-control": "public, max-age=300, s-maxage=300",
					},
				});
			},
		},
	},
});
