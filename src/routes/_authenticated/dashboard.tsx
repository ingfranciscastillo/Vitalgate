import {
	ArrowRightIcon,
	BellIcon,
	GitPullRequestIcon,
	ShieldCheckIcon,
	ShieldWarningIcon,
	TrendUpIcon,
} from "@phosphor-icons/react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
	Area,
	AreaChart,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";
import { AppShell } from "@/components/app-shell";
import { GettingStarted } from "@/components/getting-started";
import { Reveal } from "@/components/reveal";
import { StatusBadge } from "@/components/status-badge";
import { Card } from "@/components/ui/card";
import { orgAlertsQueryOptions } from "@/lib/alerts.queries";
import { dashboardOverviewQueryOptions } from "@/lib/dashboard.queries";
import { formatDelivery, timeAgo } from "@/lib/format";
import { EASE_IN, staggerContainer, staggerItem } from "@/lib/motion";
import { orgPullsQueryOptions } from "@/lib/pulls.queries";
import { orgReposQueryOptions } from "@/lib/repos.queries";

export const Route = createFileRoute("/_authenticated/dashboard")({
	loader: ({ context }) =>
		Promise.all([
			context.queryClient.ensureQueryData(dashboardOverviewQueryOptions()),
			context.queryClient.ensureQueryData(orgReposQueryOptions()),
			context.queryClient.ensureQueryData(orgPullsQueryOptions()),
			context.queryClient.ensureQueryData(orgAlertsQueryOptions()),
		]),
	head: () => ({ meta: [{ title: "Dashboard: Vitalgate" }] }),
	component: Dashboard,
});

function Dashboard() {
	const { data: overview } = useSuspenseQuery(dashboardOverviewQueryOptions());
	const { data: repos } = useSuspenseQuery(orgReposQueryOptions());
	const { data: pulls } = useSuspenseQuery(orgPullsQueryOptions());
	const { data: alerts } = useSuspenseQuery(orgAlertsQueryOptions());
	const { stats, series } = overview;
	const latestPerf = [...series].reverse().find((p) => p.perf != null)?.perf;
	const reduce = useReducedMotion();

	return (
		<AppShell title="Overview">
			<GettingStarted
				repoFullNames={repos.map((r) => r.fullName)}
				prCount={stats.prCount}
			/>
			<Reveal>
				<div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
					<Card className="p-5">
						<div className="flex items-center justify-between">
							<span className="text-xs uppercase tracking-wider text-muted-foreground">
								Repositories
							</span>
							<ShieldCheckIcon className="h-4 w-4 text-muted-foreground" />
						</div>
						<div className="mt-3 font-mono text-3xl font-semibold">
							{stats.repoCount}
						</div>
						<div className="mt-1 text-xs flex items-center gap-1 text-muted-foreground">
							<TrendUpIcon className="h-3 w-3" />+{stats.newReposThisWeek} this
							week
						</div>
					</Card>

					<Card className="p-5">
						<div className="flex items-center justify-between">
							<span className="text-xs uppercase tracking-wider text-muted-foreground">
								PRs tracked
							</span>
							<GitPullRequestIcon className="h-4 w-4 text-muted-foreground" />
						</div>
						<div className="mt-3 font-mono text-3xl font-semibold">
							{stats.prCount}
						</div>
						<div className="mt-1 text-xs flex items-center gap-1 text-muted-foreground">
							<TrendUpIcon className="h-3 w-3" />
							{stats.newPrsToday} new today
						</div>
					</Card>

					<Card className="p-5">
						<div className="flex items-center justify-between">
							<span className="text-xs uppercase tracking-wider text-muted-foreground">
								Failing budgets
							</span>
							<ShieldWarningIcon
								className={`h-4 w-4 ${stats.failingBudgets > 0 ? "text-destructive animate-status-pulse" : "text-muted-foreground"}`}
							/>
						</div>
						<div className="mt-3 font-mono text-3xl font-semibold">
							{stats.failingBudgets}
						</div>
						<div className="mt-1 text-xs text-muted-foreground">
							across every connected repo
						</div>
					</Card>

					<Card className="p-5">
						<div className="flex items-center justify-between">
							<span className="text-xs uppercase tracking-wider text-muted-foreground">
								Active alerts
							</span>
							<BellIcon className="h-4 w-4 text-muted-foreground" />
						</div>
						<div className="mt-3 font-mono text-3xl font-semibold">
							{stats.activeAlerts}
						</div>
						<div className="mt-1 text-xs text-muted-foreground">
							{stats.criticalAlerts} critical, last 7 days
						</div>
					</Card>
				</div>
			</Reveal>

			<div className="mt-6 grid lg:grid-cols-3 gap-4">
				<Reveal delay={0.05} className="lg:col-span-2">
					<Card className="p-5">
						<div className="flex items-center justify-between">
							<div>
								<h2 className="font-semibold">Performance Score, workspace</h2>
								<p className="text-xs text-muted-foreground">
									Last 30 days, p50 across repos
								</p>
							</div>
							<span className="font-mono text-2xl font-semibold">
								{latestPerf ?? "—"}
								<span className="text-muted-foreground text-sm">/100</span>
							</span>
						</div>
						<div className="mt-4 h-56">
							{series.length === 0 ? (
								<div className="h-full grid place-items-center text-sm text-muted-foreground">
									No performance runs recorded yet.
								</div>
							) : (
								<ResponsiveContainer>
									<AreaChart
										data={series}
										margin={{ left: -10, right: 8, top: 8 }}
									>
										<defs>
											<linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
												<stop
													offset="0%"
													stopColor="var(--color-success)"
													stopOpacity={0.5}
												/>
												<stop
													offset="100%"
													stopColor="var(--color-success)"
													stopOpacity={0}
												/>
											</linearGradient>
										</defs>
										<XAxis
											dataKey="date"
											tick={{ fontSize: 10, fontFamily: "JetBrains Mono" }}
											stroke="var(--color-muted-foreground)"
										/>
										<YAxis
											domain={[0, 100]}
											tick={{ fontSize: 10, fontFamily: "JetBrains Mono" }}
											stroke="var(--color-muted-foreground)"
										/>
										<Tooltip
											contentStyle={{
												background: "var(--color-card)",
												border: "1px solid var(--color-border)",
												fontSize: 12,
												fontFamily: "JetBrains Mono",
											}}
										/>
										<Area
											dataKey="perf"
											stroke="var(--color-success)"
											strokeWidth={2}
											fill="url(#g1)"
											connectNulls
										/>
									</AreaChart>
								</ResponsiveContainer>
							)}
						</div>
					</Card>
				</Reveal>

				<Reveal delay={0.1}>
					<Card className="p-5">
						<div className="flex items-center justify-between">
							<h2 className="font-semibold">Active alerts</h2>
							<Link
								to="/alerts"
								className="text-xs text-primary hover:underline"
							>
								View all
							</Link>
						</div>
						{alerts.length === 0 ? (
							<p className="mt-4 text-sm text-muted-foreground text-center py-6">
								No alerts yet.
							</p>
						) : (
							<motion.ul
								className="mt-4 space-y-3"
								variants={staggerContainer}
								initial="hidden"
								animate="show"
							>
								<AnimatePresence mode="popLayout">
									{alerts.slice(0, 4).map((a) => (
										<motion.li
											key={a.id}
											variants={staggerItem(reduce)}
											exit={{
												opacity: 0,
												height: 0,
												marginTop: 0,
												transition: { duration: 0.2, ease: EASE_IN },
											}}
											className="flex gap-3 items-start overflow-hidden"
										>
											<span
												className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${a.level === "critical" ? "bg-destructive animate-status-pulse" : a.level === "warning" ? "bg-warning" : "bg-muted-foreground"}`}
											/>
											<div className="min-w-0">
												<div className="text-sm font-medium truncate">
													{a.title}
												</div>
												<div className="text-xs text-muted-foreground truncate">
													{a.message}
												</div>
												<div className="mt-0.5 font-mono text-[10px] text-muted-foreground truncate">
													{a.repoFullName} · {formatDelivery(a.deliveredTo)} ·{" "}
													{timeAgo(a.createdAt)}
												</div>
											</div>
										</motion.li>
									))}
								</AnimatePresence>
							</motion.ul>
						)}
					</Card>
				</Reveal>
			</div>

			<div className="mt-6 grid lg:grid-cols-2 gap-4 min-w-0">
				<Reveal delay={0.15} className="min-w-0">
					<Card className="min-w-0 overflow-hidden p-5">
						<div className="flex items-center justify-between mb-4">
							<h2 className="font-semibold">Repositories</h2>
							<Link
								to="/repositories"
								className="text-xs text-primary hover:underline"
							>
								All repos
							</Link>
						</div>
						{repos.length === 0 ? (
							<p className="text-sm text-muted-foreground text-center py-6">
								No repositories connected yet.
							</p>
						) : (
							<motion.ul
								className="divide-y divide-border"
								variants={staggerContainer}
								initial="hidden"
								animate="show"
							>
								<AnimatePresence mode="popLayout">
									{repos.map((r) => (
										<motion.li
											key={r.id}
											variants={staggerItem(reduce)}
											exit={{
												opacity: 0,
												height: 0,
												transition: { duration: 0.2, ease: EASE_IN },
											}}
											className="overflow-hidden"
										>
											<Link
												to="/repositories/$repoId"
												params={{ repoId: r.id }}
												className="group flex items-center gap-3 py-3 hover:bg-muted/40 -mx-2 px-2 rounded-md"
											>
												<div className="h-9 w-9 shrink-0 rounded-md bg-muted grid place-items-center font-mono text-xs">
													{(r.fullName.split("/").pop() ?? r.fullName)
														.slice(0, 2)
														.toUpperCase()}
												</div>
												<div className="flex-1 min-w-0">
													<div className="text-sm font-medium truncate">
														{r.fullName}
													</div>
													<div className="text-xs text-muted-foreground truncate">
														{r.prCount} PRs tracked, last run{" "}
														{timeAgo(r.lastRunAt)}
													</div>
												</div>
												<div className="text-right shrink-0">
													<div className="font-mono text-sm font-semibold">
														{r.avgPerf ?? "—"}
														<span className="text-muted-foreground text-xs">
															/100
														</span>
													</div>
													<div
														className={`text-[10px] ${r.failingCount ? "text-destructive" : "text-success"}`}
													>
														{r.failingCount
															? `${r.failingCount} failing`
															: "all green"}
													</div>
												</div>
												<ArrowRightIcon className="hidden sm:block h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-150 ease-out group-hover:translate-x-0.5" />
											</Link>
										</motion.li>
									))}
								</AnimatePresence>
							</motion.ul>
						)}
					</Card>
				</Reveal>

				<Reveal delay={0.2} className="min-w-0">
					<Card className="min-w-0 overflow-hidden p-5">
						<div className="flex items-center justify-between mb-4">
							<h2 className="font-semibold">Recent pull requests</h2>
							<Link
								to="/pulls"
								className="text-xs text-primary hover:underline"
							>
								All PRs
							</Link>
						</div>
						{pulls.length === 0 ? (
							<p className="text-sm text-muted-foreground text-center py-6">
								No pull requests recorded yet.
							</p>
						) : (
							<motion.ul
								className="divide-y divide-border"
								variants={staggerContainer}
								initial="hidden"
								animate="show"
							>
								<AnimatePresence mode="popLayout">
									{pulls.slice(0, 6).map((p) => (
										<motion.li
											key={p.id}
											variants={staggerItem(reduce)}
											exit={{
												opacity: 0,
												height: 0,
												transition: { duration: 0.2, ease: EASE_IN },
											}}
											className="overflow-hidden"
										>
											<Link
												to="/pulls/$prId"
												params={{ prId: p.id }}
												className="flex items-center gap-3 py-3 hover:bg-muted/40 -mx-2 px-2 rounded-md"
											>
												<span className="font-mono text-xs text-muted-foreground w-10 shrink-0">
													#{p.number}
												</span>
												<div className="flex-1 min-w-0">
													<div className="text-sm font-medium truncate">
														{p.title}
													</div>
													<div className="text-xs text-muted-foreground truncate font-mono">
														{p.repoFullName} · {p.author} ·{" "}
														{timeAgo(p.openedAt)}
													</div>
												</div>
												<div className="shrink-0">
													<StatusBadge status={p.status} />
												</div>
											</Link>
										</motion.li>
									))}
								</AnimatePresence>
							</motion.ul>
						)}
					</Card>
				</Reveal>
			</div>
		</AppShell>
	);
}
