import {
	InfoIcon,
	WarningIcon,
	WarningOctagonIcon,
} from "@phosphor-icons/react";
import {
	useMutation,
	useQueryClient,
	useSuspenseQuery,
} from "@tanstack/react-query";
import {
	createFileRoute,
	Link,
	notFound,
	useNavigate,
} from "@tanstack/react-router";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import toast from "react-hot-toast";
import {
	Area,
	AreaChart,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";
import { AppShell } from "@/components/app-shell";
import { BudgetsEditor } from "@/components/budgets-editor";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDelivery, timeAgo } from "@/lib/format";
import {
	disconnectRepository,
	regenerateRepoWorkflow,
	setRepoAuditMode,
	updateRepoEnvVars,
} from "@/lib/github.functions";
import { EASE_IN, EASE_OUT, staggerContainer, staggerItem } from "@/lib/motion";
import { useIsOrgAdmin } from "@/lib/org-roles";
import { repoDetailQueryOptions } from "@/lib/repo-detail.queries";
import { setRepoPrComments } from "@/lib/repo-settings.functions";

const levelIcon = {
	critical: WarningOctagonIcon,
	warning: WarningIcon,
	info: InfoIcon,
} as const;

const AUDIT_MODES = [
	{
		id: "build",
		label: "Build in GitHub Actions",
		desc: "Builds and starts the app in the workflow, then audits it on localhost.",
	},
	{
		id: "preview",
		label: "Preview deployments",
		desc: "Audits the preview your host (Vercel, Netlify, Render…) deploys for each pull request. Faster, and no secrets needed.",
	},
] as const;

export const Route = createFileRoute("/_authenticated/repositories/$repoId")({
	// loader must come before head — see pulls/$prId.tsx for why.
	loader: async ({ context, params }) => {
		const data = await context.queryClient.ensureQueryData(
			repoDetailQueryOptions(params.repoId),
		);
		if (!data) throw notFound();
		return data;
	},
	head: ({ loaderData }) => ({
		meta: [{ title: `${loaderData?.fullName ?? "Repository"}: Vitalgate` }],
	}),
	notFoundComponent: () => (
		<AppShell title="Repository not found">
			<p className="text-muted-foreground">No repo with that id.</p>
		</AppShell>
	),
	component: RepoDetail,
});

function RepoDetail() {
	const { repoId } = Route.useParams();
	const { data: repo } = useSuspenseQuery(repoDetailQueryOptions(repoId));
	const queryClient = useQueryClient();
	const navigate = useNavigate();
	// The loader already redirects to notFoundComponent when null; this just
	// narrows the type for TS since this query call is independent of it.
	if (!repo) throw notFound();

	const [envVarNames, setEnvVarNames] = useState(repo.envVarNames.join(", "));
	const [confirmingDisconnect, setConfirmingDisconnect] = useState(false);
	const isAdmin = useIsOrgAdmin();
	const reduce = useReducedMotion();

	const saveEnvVars = useMutation({
		mutationFn: updateRepoEnvVars,
		onSuccess: (result) => {
			queryClient.invalidateQueries({ queryKey: ["repos"] });
			if (result.workflowResult.status === "error") {
				toast.error(
					`Saved, but couldn't update the workflow: ${result.workflowResult.message}`,
				);
			} else {
				toast.success("Environment variables updated");
			}
		},
		onError: () => toast.error("Could not update environment variables"),
	});

	const setAuditMode = useMutation({
		mutationFn: setRepoAuditMode,
		onSuccess: (result, { data }) => {
			queryClient.invalidateQueries({ queryKey: ["repos", repoId] });
			if (result.status === "error" || result.status === "already-exists") {
				toast.error(
					result.status === "error"
						? `Saved, but couldn't update the workflow: ${result.message}`
						: "Saved, but a workflow Vitalgate didn't generate is in the way.",
				);
			} else {
				toast.success(
					data.auditMode === "preview"
						? "Now auditing preview deployments"
						: "Now building in GitHub Actions",
				);
			}
		},
		onError: (err) =>
			toast.error(
				err instanceof Error ? err.message : "Could not change the mode",
			),
	});

	const regenerate = useMutation({
		mutationFn: regenerateRepoWorkflow,
		onSuccess: (result) => {
			if (result.status === "error") {
				toast.error(`Couldn't update the workflow: ${result.message}`);
			} else if (result.status === "already-exists") {
				toast.error(
					"A workflow Vitalgate didn't generate already exists at that path. Remove or rename it first.",
				);
			} else {
				toast.success(
					result.status === "created" ? "Workflow added" : "Workflow updated",
				);
			}
		},
		onError: (err) =>
			toast.error(
				err instanceof Error
					? err.message
					: "Could not regenerate the workflow",
			),
	});

	const setPrComments = useMutation({
		mutationFn: setRepoPrComments,
		onSuccess: (_, { data }) => {
			queryClient.invalidateQueries({ queryKey: ["repos", repoId] });
			toast.success(
				data.enabled ? "PR comments turned on" : "PR comments turned off",
			);
		},
		onError: (err) =>
			toast.error(
				err instanceof Error ? err.message : "Could not update the setting",
			),
	});

	const disconnect = useMutation({
		mutationFn: disconnectRepository,
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["repos"] });
			toast.success(`${repo.fullName} disconnected`);
			navigate({ to: "/repositories" });
		},
		onError: () => {
			toast.error("Could not disconnect repository");
			setConfirmingDisconnect(false);
		},
	});

	return (
		<AppShell>
			<div className="flex flex-wrap items-end justify-between gap-4 mb-6">
				<div>
					<Link
						to="/repositories"
						className="text-xs text-muted-foreground hover:text-foreground"
					>
						← Repositories
					</Link>
					<h1 className="mt-2 text-2xl font-semibold tracking-tight font-mono">
						{repo.fullName}
					</h1>
					<p className="text-xs text-muted-foreground">
						Default branch{" "}
						<span className="font-mono">{repo.defaultBranch}</span> · last run{" "}
						{timeAgo(repo.lastRunAt)}
					</p>
				</div>
				<div className="flex items-center gap-3">
					<div className="text-right">
						<div className="text-xs uppercase tracking-wider text-muted-foreground">
							Health
						</div>
						<div className="font-mono text-2xl font-semibold">
							{repo.avgPerf == null ? (
								<span className="text-muted-foreground">—</span>
							) : (
								<>
									{repo.avgPerf}
									<span className="text-sm text-muted-foreground">/100</span>
								</>
							)}
						</div>
					</div>
				</div>
			</div>

			<Tabs defaultValue="overview">
				<TabsList>
					<TabsTrigger value="overview">Overview</TabsTrigger>
					<TabsTrigger value="pulls">Pull Requests</TabsTrigger>
					<TabsTrigger value="budgets">Budgets</TabsTrigger>
					<TabsTrigger value="history">History</TabsTrigger>
					<TabsTrigger value="settings">Settings</TabsTrigger>
				</TabsList>

				<TabsContent value="overview" className="mt-6 space-y-4">
					{repo.series.length === 0 ? (
						<Card className="p-10 text-center">
							<p className="text-sm text-muted-foreground">
								No performance runs recorded yet. Charts fill in once PRs are
								audited.
							</p>
						</Card>
					) : (
						<>
							<Card className="p-5">
								<h2 className="font-semibold">Performance Score</h2>
								<div className="mt-4 h-56">
									<ResponsiveContainer>
										<AreaChart
											data={repo.series}
											margin={{ left: -10, right: 8, top: 8 }}
										>
											<defs>
												<linearGradient id="r1" x1="0" y1="0" x2="0" y2="1">
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
												tick={{ fontSize: 10 }}
												stroke="var(--color-muted-foreground)"
											/>
											<YAxis
												domain={[0, 100]}
												tick={{ fontSize: 10 }}
												stroke="var(--color-muted-foreground)"
											/>
											<Tooltip
												contentStyle={{
													background: "var(--color-card)",
													border: "1px solid var(--color-border)",
													fontSize: 12,
												}}
											/>
											<Area
												dataKey="perf"
												stroke="var(--color-success)"
												strokeWidth={2}
												fill="url(#r1)"
												connectNulls
											/>
										</AreaChart>
									</ResponsiveContainer>
								</div>
							</Card>
							<div className="grid md:grid-cols-2 gap-4">
								<Card className="p-5">
									<h2 className="font-semibold">LCP trend</h2>
									<div className="mt-4 h-40">
										<ResponsiveContainer>
											<AreaChart
												data={repo.series}
												margin={{ left: -10, right: 8, top: 8 }}
											>
												<XAxis
													dataKey="date"
													tick={{ fontSize: 10 }}
													stroke="var(--color-muted-foreground)"
												/>
												<YAxis
													tick={{ fontSize: 10 }}
													stroke="var(--color-muted-foreground)"
												/>
												<Tooltip
													contentStyle={{
														background: "var(--color-card)",
														border: "1px solid var(--color-border)",
														fontSize: 12,
													}}
												/>
												<Area
													dataKey="lcp"
													stroke="var(--color-chart-3)"
													fill="var(--color-chart-3)"
													fillOpacity={0.18}
													strokeWidth={2}
													connectNulls
												/>
											</AreaChart>
										</ResponsiveContainer>
									</div>
								</Card>
								<Card className="p-5">
									<h2 className="font-semibold">INP trend</h2>
									<div className="mt-4 h-40">
										<ResponsiveContainer>
											<AreaChart
												data={repo.series}
												margin={{ left: -10, right: 8, top: 8 }}
											>
												<XAxis
													dataKey="date"
													tick={{ fontSize: 10 }}
													stroke="var(--color-muted-foreground)"
												/>
												<YAxis
													tick={{ fontSize: 10 }}
													stroke="var(--color-muted-foreground)"
												/>
												<Tooltip
													contentStyle={{
														background: "var(--color-card)",
														border: "1px solid var(--color-border)",
														fontSize: 12,
													}}
												/>
												<Area
													dataKey="inp"
													stroke="var(--color-chart-4)"
													fill="var(--color-chart-4)"
													fillOpacity={0.18}
													strokeWidth={2}
													connectNulls
												/>
											</AreaChart>
										</ResponsiveContainer>
									</div>
								</Card>
							</div>
						</>
					)}
				</TabsContent>

				<TabsContent value="pulls" className="mt-6">
					<Card className="p-0 overflow-hidden">
						{repo.pulls.length === 0 ? (
							<p className="px-5 py-10 text-center text-sm text-muted-foreground">
								No pull requests recorded yet.
							</p>
						) : (
							<div className="overflow-x-auto">
								<table className="w-full text-sm">
									<thead className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
										<tr>
											<th className="text-left font-medium px-5 py-3">PR</th>
											<th className="text-left font-medium px-5 py-3">Title</th>
											<th className="text-left font-medium px-5 py-3">
												Author
											</th>
											<th className="text-left font-medium px-5 py-3">
												Status
											</th>
										</tr>
									</thead>
									<motion.tbody
										className="divide-y divide-border"
										variants={staggerContainer}
										initial="hidden"
										animate="show"
									>
										{repo.pulls.map((p) => (
											<motion.tr
												key={p.id}
												variants={staggerItem(reduce)}
												className="hover:bg-muted/30"
											>
												<td className="px-5 py-3 font-mono">#{p.number}</td>
												<td className="px-5 py-3">
													<Link
														to="/pulls/$prId"
														params={{ prId: p.id }}
														className="font-medium hover:text-primary"
													>
														{p.title}
													</Link>
												</td>
												<td className="px-5 py-3 text-muted-foreground">
													{p.author}
												</td>
												<td className="px-5 py-3">
													<StatusBadge status={p.status} />
												</td>
											</motion.tr>
										))}
									</motion.tbody>
								</table>
							</div>
						)}
					</Card>
				</TabsContent>

				<TabsContent value="budgets" className="mt-6">
					<BudgetsEditor
						key={repo.id}
						repoId={repo.id}
						budgets={repo.budgets}
						canEdit={isAdmin === true}
					/>
				</TabsContent>

				<TabsContent value="history" className="mt-6">
					<Card className="p-5">
						<h2 className="font-semibold">Audit history</h2>
						{repo.alerts.length === 0 ? (
							<p className="mt-4 text-sm text-muted-foreground text-center py-6">
								No alerts recorded yet for this repo. A required budget
								violation on a PR shows up here.
							</p>
						) : (
							<motion.ul
								className="mt-3 divide-y divide-border [&>li:first-child]:pt-0"
								variants={staggerContainer}
								initial="hidden"
								animate="show"
							>
								{repo.alerts.map((a) => {
									const Icon = levelIcon[a.level];
									return (
										<motion.li
											key={a.id}
											variants={staggerItem(reduce)}
											className="flex gap-4 py-4"
										>
											<div
												className={`h-8 w-8 rounded-md grid place-items-center shrink-0 ${a.level === "critical" ? "bg-destructive/15 text-destructive" : a.level === "warning" ? "bg-warning/20 text-warning-foreground" : "bg-muted text-muted-foreground"}`}
											>
												<Icon className="h-4 w-4" />
											</div>
											<div className="flex-1 min-w-0">
												<div className="flex items-center gap-2">
													<span className="font-medium text-sm">{a.title}</span>
													<span
														className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${a.level === "critical" ? "bg-destructive/15 text-destructive" : a.level === "warning" ? "bg-warning/20 text-warning-foreground" : "bg-muted text-muted-foreground"}`}
													>
														{a.level}
													</span>
												</div>
												<p className="text-sm text-muted-foreground mt-0.5">
													{a.message}
												</p>
												<div className="mt-1 font-mono text-[10px] text-muted-foreground">
													{formatDelivery(a.deliveredTo)} ·{" "}
													{timeAgo(a.createdAt)}
												</div>
											</div>
										</motion.li>
									);
								})}
							</motion.ul>
						)}
					</Card>
				</TabsContent>

				<TabsContent value="settings" className="mt-6 space-y-4">
					{isAdmin === false ? (
						<Card className="p-5">
							<p className="text-sm text-muted-foreground">
								Only workspace owners and admins can change repository settings.
							</p>
						</Card>
					) : (
						<>
							<Card className="p-5">
								<h2 className="font-semibold text-sm">
									How pull requests are audited
								</h2>
								<div
									role="radiogroup"
									aria-label="Audit mode"
									className="mt-4 grid gap-2 sm:grid-cols-2"
								>
									{AUDIT_MODES.map((mode) => (
										<label
											key={mode.id}
											className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors ${
												repo.auditMode === mode.id
													? "border-primary bg-primary/5"
													: "border-border hover:bg-muted/30"
											} ${setAuditMode.isPending ? "pointer-events-none opacity-60" : ""}`}
										>
											<input
												type="radio"
												name="audit-mode"
												className="mt-1 accent-(--color-primary)"
												checked={repo.auditMode === mode.id}
												disabled={setAuditMode.isPending}
												onChange={() =>
													setAuditMode.mutate({
														data: { repoId, auditMode: mode.id },
													})
												}
											/>
											<div>
												<div className="text-sm font-medium">{mode.label}</div>
												<p className="mt-0.5 text-xs text-muted-foreground">
													{mode.desc}
												</p>
											</div>
										</label>
									))}
								</div>
								{repo.auditMode === "preview" && (
									<p className="mt-3 text-xs text-muted-foreground">
										If your Vercel previews are protected, add the project's
										Protection Bypass for Automation secret to this repository
										as{" "}
										<code className="font-mono">
											VERCEL_AUTOMATION_BYPASS_SECRET
										</code>
										.
									</p>
								)}
							</Card>
							<Card className="p-5">
								<div className="flex items-start justify-between gap-4">
									<div>
										<h2 className="font-semibold text-sm">
											Pull request comments
										</h2>
										<p className="mt-1 text-xs text-muted-foreground">
											Post each run's results as a comment on the pull request,
											updated on every push. The check passes or fails either
											way.
										</p>
									</div>
									<Switch
										checked={repo.postPrComments}
										disabled={setPrComments.isPending}
										onCheckedChange={(enabled) =>
											setPrComments.mutate({
												data: { repoId, enabled: Boolean(enabled) },
											})
										}
										aria-label="Post results as a pull request comment"
									/>
								</div>
							</Card>
							<Card className="p-5">
								<div className="flex flex-wrap items-start justify-between gap-4">
									<div>
										<h2 className="font-semibold text-sm">Workflow</h2>
										<p className="mt-1 text-xs text-muted-foreground">
											Recommit{" "}
											<code className="font-mono">
												.github/workflows/vitalgate.yml
											</code>{" "}
											from the latest template and this repository's settings.
										</p>
									</div>
									<Button
										size="sm"
										variant="outline"
										disabled={regenerate.isPending}
										onClick={() => regenerate.mutate({ data: repoId })}
									>
										{regenerate.isPending
											? "Regenerating…"
											: "Regenerate workflow"}
									</Button>
								</div>
							</Card>
							<Card className="p-5">
								<h2 className="font-semibold text-sm">Environment variables</h2>
								{repo.auditMode === "preview" && (
									<p className="mt-1 text-xs font-medium text-foreground">
										Not used while auditing preview deployments — your host
										already runs the app with its own variables.
									</p>
								)}
								<p className="mt-1 text-xs text-muted-foreground">
									Comma-separated names of repo secrets the started server needs
									to boot — not their values. Each becomes a{" "}
									<code className="font-mono">secrets.NAME</code> reference in
									the committed workflow, so the secret must already exist in
									this repo's own GitHub settings.
								</p>
								<div className="mt-4 space-y-1.5">
									<Label htmlFor="env-var-names" className="text-sm">
										Secret names
									</Label>
									<Input
										id="env-var-names"
										placeholder="DATABASE_URL, GROQ_API_KEY"
										value={envVarNames}
										onChange={(e) => setEnvVarNames(e.target.value)}
										className="font-mono text-xs"
									/>
								</div>
								<Button
									className="mt-4"
									size="sm"
									disabled={saveEnvVars.isPending}
									onClick={() =>
										saveEnvVars.mutate({
											data: {
												repoId,
												envVarNames: envVarNames
													.split(",")
													.map((n) => n.trim())
													.filter(Boolean),
											},
										})
									}
								>
									{saveEnvVars.isPending ? "Saving…" : "Save"}
								</Button>
							</Card>

							<Card className="p-5 border-destructive/30">
								<h2 className="font-semibold text-sm">Danger zone</h2>
								<p className="mt-1 text-xs text-muted-foreground">
									Disconnecting removes {repo.fullName} from Vitalgate, deleting
									its budgets, PR history, and alerts. This can't be undone. The
									committed workflow file is removed from the repo on a
									best-effort basis.
								</p>
								<AnimatePresence mode="wait" initial={false}>
									{confirmingDisconnect ? (
										<motion.div
											key="confirm"
											initial={{ opacity: 0, y: -4 }}
											animate={{ opacity: 1, y: 0 }}
											exit={{ opacity: 0, y: -4 }}
											transition={{ duration: 0.15, ease: EASE_OUT }}
											className="mt-4 flex items-center gap-3"
										>
											<span className="text-sm font-medium">Are you sure?</span>
											<Button
												variant="destructive"
												size="sm"
												disabled={disconnect.isPending}
												onClick={() => disconnect.mutate({ data: repoId })}
											>
												{disconnect.isPending
													? "Disconnecting…"
													: "Yes, disconnect"}
											</Button>
											<Button
												variant="ghost"
												size="sm"
												disabled={disconnect.isPending}
												onClick={() => setConfirmingDisconnect(false)}
											>
												Cancel
											</Button>
										</motion.div>
									) : (
										<motion.div
											key="trigger"
											initial={{ opacity: 0 }}
											animate={{ opacity: 1 }}
											exit={{ opacity: 0 }}
											transition={{ duration: 0.15, ease: EASE_IN }}
										>
											<Button
												className="mt-4"
												variant="destructive"
												size="sm"
												onClick={() => setConfirmingDisconnect(true)}
											>
												Disconnect repository
											</Button>
										</motion.div>
									)}
								</AnimatePresence>
							</Card>
						</>
					)}
				</TabsContent>
			</Tabs>
		</AppShell>
	);
}
