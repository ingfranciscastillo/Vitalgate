import { MagnifyingGlassIcon } from "@phosphor-icons/react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { timeAgo } from "@/lib/format";
import { formatMetric, metricDelta } from "@/lib/mock-data";
import { staggerContainer, staggerItem } from "@/lib/motion";
import { orgPullsPageQueryOptions } from "@/lib/pulls.queries";

export const Route = createFileRoute("/_authenticated/pulls/")({
	// Page, search and repository live in the URL, so a filtered page can be
	// shared or reloaded, and Back steps through pages.
	validateSearch: (search): { page?: number; q?: string; repo?: string } => ({
		page:
			typeof search.page === "number" && search.page > 1
				? Math.floor(search.page)
				: undefined,
		q: typeof search.q === "string" && search.q ? search.q : undefined,
		repo:
			typeof search.repo === "string" && search.repo ? search.repo : undefined,
	}),
	loaderDeps: ({ search }) => search,
	loader: ({ context, deps }) =>
		context.queryClient.ensureQueryData(
			orgPullsPageQueryOptions({
				page: deps.page ?? 1,
				q: deps.q,
				repoId: deps.repo,
			}),
		),
	head: () => ({ meta: [{ title: "Pull Requests: Vitalgate" }] }),
	component: Pulls,
});

function Pulls() {
	const search = Route.useSearch();
	const navigate = Route.useNavigate();
	const page = search.page ?? 1;
	// Keeps the current rows on screen while the next page loads, instead of
	// suspending back to a blank table.
	const { data } = useQuery({
		...orgPullsPageQueryOptions({ page, q: search.q, repoId: search.repo }),
		placeholderData: keepPreviousData,
	});
	const [query, setQuery] = useState(search.q ?? "");
	const reduce = useReducedMotion();

	// Search as the user types, but only once they pause.
	useEffect(() => {
		const q = query.trim() || undefined;
		if (q === search.q) return;
		const id = setTimeout(
			() =>
				navigate({
					search: (prev) => ({ ...prev, q, page: undefined }),
					replace: true,
				}),
			300,
		);
		return () => clearTimeout(id);
	}, [query, search.q, navigate]);

	if (!data) return null;
	const pulls = data.items;
	const pageCount = Math.max(1, Math.ceil(data.total / data.pageSize));
	const first = data.total === 0 ? 0 : (page - 1) * data.pageSize + 1;
	const last = Math.min(page * data.pageSize, data.total);
	const filtering = Boolean(search.q || search.repo);
	const goToPage = (next: number) =>
		navigate({
			search: (prev) => ({ ...prev, page: next > 1 ? next : undefined }),
		});

	return (
		<AppShell title="Pull Requests">
			{data.total === 0 && !filtering ? (
				<Card className="p-10 text-center">
					<p className="text-sm text-muted-foreground">
						No pull requests recorded yet. They show up here once a connected
						repo's workflow reports a run.
					</p>
				</Card>
			) : (
				<>
					<div className="mb-4 flex flex-wrap items-center gap-3">
						<div className="relative w-full sm:w-80">
							<MagnifyingGlassIcon className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
							<Input
								placeholder="Search title, author, repo…"
								aria-label="Search pull requests"
								value={query}
								onChange={(e) => setQuery(e.target.value)}
								className="h-9 pl-8"
							/>
						</div>
						<select
							aria-label="Filter by repository"
							value={search.repo ?? "all"}
							onChange={(e) =>
								navigate({
									search: (prev) => ({
										...prev,
										repo: e.target.value === "all" ? undefined : e.target.value,
										page: undefined,
									}),
								})
							}
							className="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-sm"
						>
							<option value="all">All repositories</option>
							{data.repos.map((r) => (
								<option key={r.id} value={r.id}>
									{r.fullName}
								</option>
							))}
						</select>
					</div>
					{pulls.length === 0 ? (
						<Card className="p-10 text-center">
							<p className="text-sm text-muted-foreground">
								No pull requests match your filters.
							</p>
						</Card>
					) : (
						<Card className="p-0 overflow-hidden">
							<div className="overflow-x-auto">
								<table className="w-full text-sm">
									<thead className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
										<tr>
											<th className="text-left font-medium px-5 py-3">PR</th>
											<th className="text-left font-medium px-5 py-3">Title</th>
											<th className="text-left font-medium px-5 py-3">Repo</th>
											<th className="text-left font-medium px-5 py-3">LCP</th>
											<th className="text-left font-medium px-5 py-3">Score</th>
											<th className="text-left font-medium px-5 py-3">
												Status
											</th>
										</tr>
									</thead>
									{/* Keyed by the result set, so each new page or search
									    replays the stagger instead of animating row exits
									    (which table rows don't support well). */}
									<motion.tbody
										key={`${page}|${search.q ?? ""}|${search.repo ?? ""}`}
										className="divide-y divide-border"
										variants={staggerContainer}
										initial="hidden"
										animate="show"
									>
										{pulls.map((p) => {
											const lcp =
												p.metrics.LCP != null && p.baseline.LCP != null
													? metricDelta("LCP", p.metrics.LCP, p.baseline.LCP)
													: null;
											const perf =
												p.metrics.PERF != null && p.baseline.PERF != null
													? metricDelta("PERF", p.metrics.PERF, p.baseline.PERF)
													: null;
											return (
												<motion.tr
													key={p.id}
													variants={staggerItem(reduce)}
													className="hover:bg-muted/30"
												>
													<td className="px-5 py-3 font-mono text-xs text-muted-foreground">
														#{p.number}
													</td>
													<td className="px-5 py-3">
														<Link
															to="/pulls/$prId"
															params={{ prId: p.id }}
															className="font-medium hover:text-primary"
														>
															{p.title}
														</Link>
														<div className="text-xs text-muted-foreground font-mono">
															{p.author} · {timeAgo(p.openedAt)}
														</div>
													</td>
													<td className="px-5 py-3 font-mono text-xs">
														{p.repoFullName}
													</td>
													<td className="px-5 py-3 font-mono">
														{p.metrics.LCP == null ? (
															<span className="text-muted-foreground">—</span>
														) : (
															<>
																<span>
																	{formatMetric("LCP", p.metrics.LCP)}
																</span>{" "}
																{lcp && (
																	<span
																		className={`text-xs ml-1 ${lcp.better ? "text-success" : "text-destructive"}`}
																	>
																		{lcp.diff >= 0 ? "+" : ""}
																		{lcp.pct.toFixed(0)}%
																	</span>
																)}
															</>
														)}
													</td>
													<td className="px-5 py-3 font-mono">
														{p.metrics.PERF == null ? (
															<span className="text-muted-foreground">—</span>
														) : (
															<>
																<span>{p.metrics.PERF}</span>{" "}
																{perf && (
																	<span
																		className={`text-xs ml-1 ${perf.better ? "text-success" : "text-destructive"}`}
																	>
																		{perf.diff >= 0 ? "+" : ""}
																		{perf.diff}
																	</span>
																)}
															</>
														)}
													</td>
													<td className="px-5 py-3">
														<StatusBadge status={p.status} />
													</td>
												</motion.tr>
											);
										})}
									</motion.tbody>
								</table>
							</div>
						</Card>
					)}
					{data.total > 0 && (
						<nav
							aria-label="Pagination"
							className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm"
						>
							<span className="text-muted-foreground">
								{first}–{last} of {data.total}
							</span>
							<div className="flex items-center gap-2">
								<Button
									variant="outline"
									size="sm"
									disabled={page <= 1}
									onClick={() => goToPage(page - 1)}
								>
									Previous
								</Button>
								<span className="text-muted-foreground">
									Page {page} of {pageCount}
								</span>
								<Button
									variant="outline"
									size="sm"
									disabled={page >= pageCount}
									onClick={() => goToPage(page + 1)}
								>
									Next
								</Button>
							</div>
						</nav>
					)}
				</>
			)}
		</AppShell>
	);
}
