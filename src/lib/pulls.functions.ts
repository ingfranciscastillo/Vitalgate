import { createServerFn } from "@tanstack/react-start";
import { and, count, desc, eq, ilike, or } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { budgets, pullRequests, repos } from "@/db/schema";
import { ensureSession } from "@/lib/auth.functions";
import type { Action, MetricKey, PrStatus, Severity } from "@/lib/mock-data";
import { idSchema, parseInput } from "@/lib/validation";

type MetricSnapshot = Partial<Record<MetricKey, number>>;

export interface OrgPullListItem {
	id: string;
	number: number;
	title: string;
	author: string;
	openedAt: string;
	status: PrStatus;
	repoId: string;
	repoFullName: string;
	metrics: MetricSnapshot;
	baseline: MetricSnapshot;
}

/** Every PR Vitalgate has recorded, across every repo in the active org. */
export const getOrgPulls = createServerFn({ method: "GET" }).handler(
	async (): Promise<OrgPullListItem[]> => {
		const session = await ensureSession();
		const organizationId = session.session.activeOrganizationId;
		if (!organizationId) return [];

		const rows = await db
			.select({
				id: pullRequests.id,
				number: pullRequests.number,
				title: pullRequests.title,
				author: pullRequests.author,
				openedAt: pullRequests.openedAt,
				status: pullRequests.status,
				metrics: pullRequests.metrics,
				baseline: pullRequests.baseline,
				repoId: repos.id,
				repoFullName: repos.fullName,
			})
			.from(pullRequests)
			.innerJoin(repos, eq(pullRequests.repoId, repos.id))
			.where(eq(repos.organizationId, organizationId))
			.orderBy(desc(pullRequests.openedAt));

		return rows.map((r) => ({
			...r,
			openedAt: r.openedAt.toISOString(),
		}));
	},
);

export const PULLS_PAGE_SIZE = 25;

export interface OrgPullsPage {
	items: OrgPullListItem[];
	/** Pull requests matching the filters, across all pages. */
	total: number;
	page: number;
	pageSize: number;
	/** Every repository in the workspace, for the repository filter. */
	repos: { id: string; fullName: string }[];
}

/** Escapes LIKE wildcards so a search for "50%" matches literally. */
function likePattern(query: string): string {
	return `%${query.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

/**
 * One page of the workspace's pull requests, newest first, filtered on the
 * server by a search across title, author and repository, and by
 * repository — the Pull Requests page.
 */
export const getOrgPullsPage = createServerFn({ method: "GET" })
	.validator(
		parseInput(
			z.object({
				page: z.number().int().min(1).max(10_000).default(1),
				q: z.string().trim().max(200).optional(),
				repoId: idSchema.optional(),
			}),
		),
	)
	.handler(async ({ data }): Promise<OrgPullsPage> => {
		const session = await ensureSession();
		const organizationId = session.session.activeOrganizationId;
		const empty = {
			items: [],
			total: 0,
			page: data.page,
			pageSize: PULLS_PAGE_SIZE,
			repos: [],
		};
		if (!organizationId) return empty;

		const where = and(
			eq(repos.organizationId, organizationId),
			data.repoId ? eq(repos.id, data.repoId) : undefined,
			data.q
				? or(
						ilike(pullRequests.title, likePattern(data.q)),
						ilike(pullRequests.author, likePattern(data.q)),
						ilike(repos.fullName, likePattern(data.q)),
					)
				: undefined,
		);

		const [rows, [{ total }], repoRows] = await Promise.all([
			db
				.select({
					id: pullRequests.id,
					number: pullRequests.number,
					title: pullRequests.title,
					author: pullRequests.author,
					openedAt: pullRequests.openedAt,
					status: pullRequests.status,
					metrics: pullRequests.metrics,
					baseline: pullRequests.baseline,
					repoId: repos.id,
					repoFullName: repos.fullName,
				})
				.from(pullRequests)
				.innerJoin(repos, eq(pullRequests.repoId, repos.id))
				.where(where)
				.orderBy(desc(pullRequests.openedAt))
				.limit(PULLS_PAGE_SIZE)
				.offset((data.page - 1) * PULLS_PAGE_SIZE),
			db
				.select({ total: count() })
				.from(pullRequests)
				.innerJoin(repos, eq(pullRequests.repoId, repos.id))
				.where(where),
			db
				.select({ id: repos.id, fullName: repos.fullName })
				.from(repos)
				.where(eq(repos.organizationId, organizationId))
				.orderBy(repos.fullName),
		]);

		return {
			items: rows.map((r) => ({ ...r, openedAt: r.openedAt.toISOString() })),
			total,
			page: data.page,
			pageSize: PULLS_PAGE_SIZE,
			repos: repoRows,
		};
	});

export interface PullDetailBudget {
	metric: MetricKey;
	max: number;
	severity: Severity;
	action: Action;
}

export interface PullDetail {
	id: string;
	number: number;
	title: string;
	author: string;
	branch: string;
	status: PrStatus;
	openedAt: string;
	metrics: MetricSnapshot;
	baseline: MetricSnapshot;
	repo: {
		id: string;
		fullName: string;
		defaultBranch: string;
		budgets: PullDetailBudget[];
	};
}

/**
 * A single PR's detail, scoped to the active org (not just the id — a UUID
 * guess from another org's PR must not leak data, same as getRepoDetail).
 */
export const getPullDetail = createServerFn({ method: "GET" })
	.validator(parseInput(idSchema))
	.handler(async ({ data: prId }): Promise<PullDetail | null> => {
		const session = await ensureSession();
		const organizationId = session.session.activeOrganizationId;
		if (!organizationId) return null;

		const [row] = await db
			.select({
				id: pullRequests.id,
				number: pullRequests.number,
				title: pullRequests.title,
				author: pullRequests.author,
				branch: pullRequests.branch,
				status: pullRequests.status,
				openedAt: pullRequests.openedAt,
				metrics: pullRequests.metrics,
				baseline: pullRequests.baseline,
				repoId: repos.id,
				repoFullName: repos.fullName,
				repoDefaultBranch: repos.defaultBranch,
			})
			.from(pullRequests)
			.innerJoin(repos, eq(pullRequests.repoId, repos.id))
			.where(
				and(
					eq(pullRequests.id, prId),
					eq(repos.organizationId, organizationId),
				),
			)
			.limit(1);
		if (!row) return null;

		const budgetRows = await db
			.select({
				metric: budgets.metric,
				max: budgets.max,
				severity: budgets.severity,
				action: budgets.action,
			})
			.from(budgets)
			.where(eq(budgets.repoId, row.repoId));

		return {
			id: row.id,
			number: row.number,
			title: row.title,
			author: row.author,
			branch: row.branch,
			status: row.status,
			openedAt: row.openedAt.toISOString(),
			metrics: row.metrics,
			baseline: row.baseline,
			repo: {
				id: row.repoId,
				fullName: row.repoFullName,
				defaultBranch: row.repoDefaultBranch,
				budgets: budgetRows,
			},
		};
	});
