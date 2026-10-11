import {
	ArrowLeftIcon,
	ArrowSquareOutIcon,
	BuildingsIcon,
	CaretRightIcon,
	CheckCircleIcon,
	GitBranchIcon,
	GithubLogoIcon,
	LockIcon,
	MagnifyingGlassIcon,
} from "@phosphor-icons/react";
import {
	useMutation,
	useQuery,
	useQueryClient,
	useSuspenseQuery,
} from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { AppShell } from "@/components/app-shell";
import { RepoLimitDialog } from "@/components/repo-limit-dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { AUDIT_MODES, type AuditMode } from "@/lib/audit-modes";
import { authClient } from "@/lib/auth-client";
import {
	connectRepositories,
	detectPreviewDeployments,
} from "@/lib/github.functions";
import { connectableReposQueryOptions } from "@/lib/github.queries";
import { getGithubInstallUrl } from "@/lib/integrations.functions";
import { EASE_IN, staggerContainer, staggerItem } from "@/lib/motion";
import { useIsOrgAdmin } from "@/lib/org-roles";
import { FREE_REPO_LIMIT, isPro } from "@/lib/plan";
import { orgReposQueryOptions } from "@/lib/repos.queries";

export const Route = createFileRoute("/_authenticated/repositories/new")({
	// loader must come before head — with both present on a route, head-before-loader
	// breaks TanStack Router's Route.useLoaderData() type inference (returns undefined).
	loader: ({ context }) =>
		context.queryClient.ensureQueryData(connectableReposQueryOptions()),
	head: () => ({
		meta: [
			{ title: "Connect a repository: Vitalgate" },
			{
				name: "description",
				content:
					"Connect a GitHub repository to Vitalgate to start enforcing performance budgets on every PR.",
			},
		],
	}),
	component: ConnectRepo,
});

type PresetId = "default" | "strict" | "relaxed" | "custom";

const PRESETS: {
	id: PresetId;
	label: string;
	desc: string;
	recommended?: boolean;
}[] = [
	{
		id: "default",
		label: "Default (Core Web Vitals)",
		desc: "LCP 2.5s · TBT 300ms · CLS 0.1 · Score ≥ 90",
		recommended: true,
	},
	{
		id: "strict",
		label: "Strict",
		desc: "LCP 2.0s · TBT 200ms · CLS 0.05 · Score ≥ 95",
	},
	{
		id: "relaxed",
		label: "Relaxed",
		desc: "LCP 3.5s · TBT 500ms · CLS 0.15 · Score ≥ 75",
	},
	{
		id: "custom",
		label: "Custom",
		desc: "Configure budgets manually after connecting",
	},
];

function ConnectRepo() {
	const {
		data: { repos: available, needsAppInstall },
	} = useSuspenseQuery(connectableReposQueryOptions());
	const { data: connectedRepos } = useQuery(orgReposQueryOptions());
	const { data: activeOrg } = authClient.useActiveOrganization();
	const [query, setQuery] = useState("");
	const [org, setOrg] = useState<string>("all");
	const [selected, setSelected] = useState<string[]>([]);
	const [preset, setPreset] = useState<PresetId>("default");
	const [branchProtect, setBranchProtect] = useState(true);
	const [postComments, setPostComments] = useState(true);
	const [startScript, setStartScript] = useState("");
	const [port, setPort] = useState("");
	const [envVarNames, setEnvVarNames] = useState("");
	// Null until the user picks one: until then, preview is suggested when
	// every selected repo already gets preview deployments.
	const [chosenAuditMode, setChosenAuditMode] = useState<AuditMode | null>(
		null,
	);
	const sortedSelection = [...selected].sort();
	const { data: previewRepoIds } = useQuery({
		queryKey: ["github", "preview-deployments", sortedSelection],
		queryFn: () => detectPreviewDeployments({ data: sortedSelection }),
		enabled: sortedSelection.length > 0 && sortedSelection.length <= 20,
		staleTime: 5 * 60_000,
	});
	const previewDetected =
		selected.length > 0 && selected.every((id) => previewRepoIds?.includes(id));
	const auditMode: AuditMode =
		chosenAuditMode ?? (previewDetected ? "preview" : "build");
	const [shakeSummary, setShakeSummary] = useState(false);
	const [showLimitDialog, setShowLimitDialog] = useState(false);
	const [justConnected, setJustConnected] = useState<{
		repos: { id: string; fullName: string }[];
		auditMode: AuditMode;
	} | null>(null);
	const reduce = useReducedMotion();

	const orgs = useMemo(
		() => Array.from(new Set(available.map((r) => r.org))),
		[available],
	);
	const filtered = useMemo(
		() =>
			available.filter(
				(r) =>
					(org === "all" || r.org === org) &&
					(query.trim() === "" ||
						r.fullName.toLowerCase().includes(query.toLowerCase())),
			),
		[available, query, org],
	);

	const pro = isPro(activeOrg?.plan);
	const connectedCount = connectedRepos?.length ?? 0;
	const remainingFree = pro
		? Number.POSITIVE_INFINITY
		: Math.max(0, FREE_REPO_LIMIT - connectedCount);
	const atLimit = selected.length >= remainingFree;

	const toggle = (id: string) =>
		setSelected((s) => {
			if (connectedRepos?.some((r) => r.githubRepoId === id)) return s;
			if (s.includes(id)) return s.filter((x) => x !== id);
			if (s.length >= remainingFree) {
				setShowLimitDialog(true);
				return s;
			}
			return [...s, id];
		});

	const queryClient = useQueryClient();
	const connectMutation = useMutation({
		mutationFn: connectRepositories,
		onSuccess: ({
			connected,
			connectedRepos: newlyConnected,
			workflowsAdded,
			workflowsUpdated,
			workflowErrors,
		}) => {
			toast.success(
				`Connected ${connected} ${connected === 1 ? "repository" : "repositories"}` +
					(workflowsAdded > 0
						? `, added the Vitalgate workflow to ${workflowsAdded}`
						: "") +
					(workflowsUpdated > 0 ? `, updated it on ${workflowsUpdated}` : ""),
			);
			for (const err of workflowErrors) {
				toast.error(`Couldn't add workflow to ${err}`);
			}
			queryClient.invalidateQueries({ queryKey: ["repos"] });
			// Next step on the way to a first audit: opening a pull request.
			if (newlyConnected.length > 0) {
				setJustConnected({ repos: newlyConnected, auditMode });
				window.scrollTo({ top: 0 });
			}
		},
		onError: (error) => {
			toast.error(error instanceof Error ? error.message : "Could not connect");
		},
	});

	const isAdmin = useIsOrgAdmin();
	const [openingGithub, setOpeningGithub] = useState(false);

	const installGithubApp = async () => {
		setOpeningGithub(true);
		try {
			window.location.href = await getGithubInstallUrl({ data: "connect" });
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Could not open GitHub");
			setOpeningGithub(false);
		}
	};

	// Back from installing the app (/api/github/setup redirects here with
	// ?integration=github&status=…): say how it went once, then clean the URL.
	useEffect(() => {
		const params = new URLSearchParams(window.location.search);
		if (params.get("integration") !== "github") return;
		if (params.get("status") === "connected") {
			toast.success("GitHub App installed — pick a repository to connect.");
		} else {
			const reason = params.get("reason");
			toast.error(
				`Could not install the GitHub App${reason ? `: ${reason}` : ""}`,
			);
		}
		window.history.replaceState({}, "", window.location.pathname);
	}, []);

	const onConnect = () => {
		if (selected.length === 0) {
			toast.error("Select at least one repository");
			setShakeSummary(true);
			return;
		}
		const chosen = available.filter((r) => selected.includes(r.id));
		connectMutation.mutate({
			data: {
				repos: chosen.map((r) => ({
					id: r.id,
					name: r.name,
					fullName: r.fullName,
					defaultBranch: r.defaultBranch,
					private: r.private,
				})),
				preset,
				branchProtect,
				postComments,
				auditMode,
				startScript: startScript.trim() || undefined,
				port: port.trim() ? Number(port) : undefined,
				envVarNames: envVarNames
					.split(",")
					.map((n) => n.trim())
					.filter(Boolean),
			},
		});
	};

	if (isAdmin === false) {
		return (
			<AppShell title="Connect a repository">
				<Card className="p-5 max-w-xl">
					<p className="text-sm text-muted-foreground">
						Only workspace owners and admins can connect repositories. Ask an
						admin of this workspace to connect it, or to change your role.
					</p>
				</Card>
			</AppShell>
		);
	}

	if (needsAppInstall) {
		return (
			<AppShell title="Connect a repository">
				<Card className="p-6 max-w-xl">
					<div className="flex items-start gap-3">
						<div className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-muted">
							<GithubLogoIcon className="h-4 w-4" />
						</div>
						<div>
							<h2 className="font-semibold">
								Install the Vitalgate GitHub App
							</h2>
							<p className="mt-1 text-sm text-muted-foreground">
								You choose which repositories Vitalgate can access. It only gets
								what it needs there: adding its workflow file and commenting
								results on pull requests. You come back here to pick a
								repository once it's installed.
							</p>
							<Button
								loading={openingGithub}
								className="mt-4"
								disabled={openingGithub}
								onClick={installGithubApp}
							>
								{openingGithub ? "Opening GitHub…" : "Install GitHub App"}
							</Button>
						</div>
					</div>
				</Card>
			</AppShell>
		);
	}

	const connectedIds = new Set(connectedRepos?.map((r) => r.githubRepoId));
	// Search and filters only earn their space once there are enough repos to
	// look through; with a couple of repos they're just clutter.
	const showSearch = available.length > 6;
	const selectedRepos = available.filter((r) => selected.includes(r.id));
	const presetLabel = PRESETS.find((p) => p.id === preset)?.label ?? preset;
	const connectLabel = connectMutation.isPending
		? "Connecting…"
		: `Connect ${selected.length > 0 ? `${selected.length} ` : ""}repositor${selected.length === 1 ? "y" : "ies"}`;

	if (justConnected) {
		return (
			<AppShell title="Connect a repository">
				<ConnectedNextStep {...justConnected} />
			</AppShell>
		);
	}

	return (
		<AppShell title="Connect a repository">
			<RepoLimitDialog
				open={showLimitDialog}
				onOpenChange={setShowLimitDialog}
			/>
			<div>
				<Link
					to="/repositories"
					className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
				>
					<ArrowLeftIcon className="h-3.5 w-3.5" /> Back to repositories
				</Link>
				<div className="mt-3 mb-6">
					<p className="text-sm text-muted-foreground">
						Vitalgate adds a workflow that audits every pull request with
						Lighthouse and checks it against your budgets.
					</p>
				</div>

				{/* Same split as Team and Alerts: content across two thirds, the
				    action card in the last third. Below lg it's one column with a
				    sticky action bar instead. */}
				<div className="grid gap-4 lg:grid-cols-3 lg:items-start">
					<div className="space-y-4 lg:col-span-2">
						<Card className="p-0 overflow-hidden">
							<div className="flex flex-wrap items-center gap-2 border-b border-border px-5 py-3">
								<h2 className="mr-auto text-sm font-semibold">Repositories</h2>
								{orgs.length > 1 && (
									<Select value={org} onValueChange={setOrg}>
										<SelectTrigger className="h-8 w-44">
											<BuildingsIcon className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
											<SelectValue placeholder="All accounts" />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="all">All accounts</SelectItem>
											{orgs.map((o) => (
												<SelectItem key={o} value={o}>
													{o}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								)}
								{showSearch && (
									<div className="relative w-full sm:w-56">
										<MagnifyingGlassIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
										<Input
											placeholder="Search repositories"
											value={query}
											onChange={(e) => setQuery(e.target.value)}
											className="h-8 pl-8"
										/>
									</div>
								)}
							</div>

							<motion.ul
								className="max-h-104 divide-y divide-border overflow-y-auto"
								variants={staggerContainer}
								initial="hidden"
								animate="show"
							>
								{filtered.length === 0 && (
									<li className="px-5 py-10 text-center text-sm text-muted-foreground">
										{query
											? `No repositories match "${query}".`
											: "No repositories yet."}
									</li>
								)}
								<AnimatePresence mode="popLayout">
									{filtered.map((r) => {
										const alreadyConnected = connectedIds.has(r.id);
										const checked = selected.includes(r.id);
										const disabled = alreadyConnected || (!checked && atLimit);
										return (
											<motion.li
												key={r.id}
												variants={staggerItem(reduce)}
												exit={{
													opacity: 0,
													height: 0,
													transition: { duration: 0.15, ease: EASE_IN },
												}}
												className="overflow-hidden"
											>
												<label
													htmlFor={`repo-${r.id}`}
													className={`flex items-center gap-4 px-5 py-3 transition-colors ${
														alreadyConnected
															? "cursor-default"
															: checked
																? "cursor-pointer bg-primary/5"
																: disabled
																	? "cursor-not-allowed opacity-50"
																	: "cursor-pointer hover:bg-muted/30"
													}`}
												>
													<Checkbox
														id={`repo-${r.id}`}
														checked={checked || alreadyConnected}
														disabled={disabled}
														onCheckedChange={() => toggle(r.id)}
													/>
													<div className="flex-1 min-w-0">
														<div className="flex items-center gap-2">
															<span className="truncate font-mono text-sm font-medium">
																{r.fullName}
															</span>
															{r.private && (
																<span className="inline-flex items-center gap-1 rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
																	<LockIcon className="h-2.5 w-2.5" /> private
																</span>
															)}
														</div>
														<div className="mt-0.5 flex items-center gap-3 font-mono text-[11px] text-muted-foreground">
															<span className="inline-flex items-center gap-1">
																<GitBranchIcon className="h-3 w-3" />{" "}
																{r.defaultBranch}
															</span>
															<span>{r.language}</span>
															<span>updated {r.updated}</span>
														</div>
													</div>
													{alreadyConnected && (
														<span className="shrink-0 rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-medium text-success">
															Connected
														</span>
													)}
												</label>
											</motion.li>
										);
									})}
								</AnimatePresence>
							</motion.ul>
							<div className="border-t border-border px-5 py-3 text-xs text-muted-foreground">
								Don't see a repository?{" "}
								<button
									type="button"
									className="font-medium text-foreground underline-offset-2 hover:underline disabled:opacity-60"
									disabled={openingGithub}
									onClick={installGithubApp}
								>
									Give the GitHub App access to it
								</button>
							</div>
						</Card>

						<Card className="p-5">
							<h2 className="text-sm font-semibold">
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
											auditMode === mode.id
												? "border-primary bg-primary/5"
												: "border-border hover:bg-muted/30"
										}`}
									>
										<input
											type="radio"
											name="audit-mode"
											className="mt-1 accent-(--color-primary)"
											checked={auditMode === mode.id}
											onChange={() => setChosenAuditMode(mode.id)}
										/>
										<div className="min-w-0">
											<div className="flex items-center gap-2">
												<span className="text-sm font-medium">
													{mode.label}
												</span>
												{mode.id === "preview" && previewDetected && (
													<span className="rounded-full bg-success/15 px-1.5 py-0.5 text-[10px] text-success">
														detected
													</span>
												)}
											</div>
											<p className="mt-0.5 text-xs text-muted-foreground">
												{mode.desc}
											</p>
										</div>
									</label>
								))}
							</div>
						</Card>

						<Card className="p-5">
							<h2 className="text-sm font-semibold">Budgets</h2>
							<p className="mt-1 text-xs text-muted-foreground">
								A starting point for every selected repository — edit them per
								repository afterwards.
							</p>
							<div
								role="radiogroup"
								aria-label="Budget preset"
								className="mt-4 grid gap-2 sm:grid-cols-2"
							>
								{PRESETS.map((p) => (
									<label
										key={p.id}
										className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors ${
											preset === p.id
												? "border-primary bg-primary/5"
												: "border-border hover:bg-muted/30"
										}`}
									>
										<input
											type="radio"
											name="preset"
											className="mt-1 accent-(--color-primary)"
											checked={preset === p.id}
											onChange={() => setPreset(p.id)}
										/>
										<div className="min-w-0">
											<div className="flex items-center gap-2">
												<span className="text-sm font-medium">{p.label}</span>
												{p.recommended && (
													<span className="rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] text-primary">
														recommended
													</span>
												)}
											</div>
											<div className="mt-0.5 font-mono text-[11px] text-muted-foreground">
												{p.desc}
											</div>
										</div>
									</label>
								))}
							</div>

							<div className="mt-5 grid gap-3 border-t border-border pt-4 sm:grid-cols-2">
								<div className="flex items-start gap-3">
									<Checkbox
										id="bp"
										checked={branchProtect}
										onCheckedChange={(v) => setBranchProtect(Boolean(v))}
									/>
									<div>
										<Label htmlFor="bp" className="text-sm">
											Fail the check on required budgets
										</Label>
										<p className="text-xs text-muted-foreground">
											Require the “Vitalgate” check in GitHub to block merges.
											Unchecked, every budget is a warning.
										</p>
									</div>
								</div>
								<div className="flex items-start gap-3">
									<Checkbox
										id="cm"
										checked={postComments}
										onCheckedChange={(v) => setPostComments(Boolean(v))}
									/>
									<div>
										<Label htmlFor="cm" className="text-sm">
											Post PR comments
										</Label>
										<p className="text-xs text-muted-foreground">
											Each metric, its change and its budget, on the pull
											request.
										</p>
									</div>
								</div>
							</div>

							{auditMode === "build" && (
								<details className="group mt-4 border-t border-border pt-4">
									<summary className="flex cursor-pointer list-none items-center gap-1.5 text-sm font-medium [&::-webkit-details-marker]:hidden">
										<CaretRightIcon className="h-3.5 w-3.5 transition-transform group-open:rotate-90" />
										Advanced: start command and secrets
										<span className="text-xs font-normal text-muted-foreground">
											— optional, usually auto-detected
										</span>
									</summary>
									<div className="mt-4 grid gap-4 sm:grid-cols-[1fr_7rem]">
										<div className="space-y-1.5">
											<Label htmlFor="start-script" className="text-sm">
												Start command
											</Label>
											<Input
												id="start-script"
												placeholder="auto-detected (e.g. start, preview)"
												value={startScript}
												onChange={(e) => setStartScript(e.target.value)}
												className="font-mono text-xs"
											/>
										</div>
										<div className="space-y-1.5">
											<Label htmlFor="port" className="text-sm">
												Port
											</Label>
											<Input
												id="port"
												type="number"
												placeholder="3000"
												value={port}
												onChange={(e) => setPort(e.target.value)}
												className="font-mono text-xs"
											/>
										</div>
									</div>
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
										<p className="text-xs text-muted-foreground">
											Repository secrets your app needs to start, by name only —
											they must already exist in the repo's GitHub settings.
										</p>
									</div>
								</details>
							)}
						</Card>
					</div>

					<aside className="hidden lg:sticky lg:top-20 lg:block">
						<Card
							className={`p-5 ${shakeSummary ? "animate-shake" : ""}`}
							onAnimationEnd={() => setShakeSummary(false)}
						>
							<h2 className="text-sm font-semibold">Summary</h2>
							{selectedRepos.length === 0 ? (
								<p className="mt-3 text-sm text-muted-foreground">
									Select the repositories to connect.
								</p>
							) : (
								<ul className="mt-3 space-y-1.5">
									{selectedRepos.map((r) => (
										<li
											key={r.id}
											className="truncate font-mono text-xs"
											title={r.fullName}
										>
											{r.fullName}
										</li>
									))}
								</ul>
							)}
							<dl className="mt-4 space-y-1.5 border-t border-border pt-4 text-xs">
								<div className="flex justify-between gap-3">
									<dt className="text-muted-foreground">Audits</dt>
									<dd>
										{auditMode === "preview"
											? "Preview deployments"
											: "Build in Actions"}
									</dd>
								</div>
								<div className="flex justify-between gap-3">
									<dt className="text-muted-foreground">Budgets</dt>
									<dd>{presetLabel}</dd>
								</div>
								<div className="flex justify-between gap-3">
									<dt className="text-muted-foreground">Check</dt>
									<dd>
										{branchProtect
											? "Fails on required budgets"
											: "Warnings only"}
									</dd>
								</div>
								<div className="flex justify-between gap-3">
									<dt className="text-muted-foreground">PR comments</dt>
									<dd>{postComments ? "On" : "Off"}</dd>
								</div>
							</dl>
							{!pro && (
								<p className="mt-4 text-xs text-muted-foreground">
									Free plan: {FREE_REPO_LIMIT} repository, {connectedCount}{" "}
									connected.{" "}
									{remainingFree === 0 && (
										<Link
											to="/settings"
											search={{ tab: "billing" }}
											className="text-primary hover:underline"
										>
											Upgrade to Pro
										</Link>
									)}
								</p>
							)}
							<Button
								className="mt-5 w-full"
								onClick={onConnect}
								loading={connectMutation.isPending}
							>
								{connectLabel}
							</Button>
							<Link to="/repositories" className="mt-2 block">
								<Button variant="ghost" className="w-full">
									Cancel
								</Button>
							</Link>
						</Card>
					</aside>
				</div>

				{/* Below lg: always in reach, however long the repository list is. */}
				<div
					className={`sticky bottom-0 z-10 mt-4 flex lg:hidden flex-wrap items-center gap-3 border border-border bg-background/95 px-5 py-3 backdrop-blur ${shakeSummary ? "animate-shake" : ""}`}
					onAnimationEnd={() => setShakeSummary(false)}
				>
					<div className="mr-auto text-sm">
						<span className="font-mono font-semibold">{selected.length}</span>{" "}
						<span className="text-muted-foreground">selected</span>
						{!pro && (
							<span className="ml-2 text-xs text-muted-foreground">
								· Free plan: {FREE_REPO_LIMIT} repository ({connectedCount}{" "}
								connected){" "}
								{remainingFree === 0 && (
									<Link
										to="/settings"
										search={{ tab: "billing" }}
										className="text-primary hover:underline"
									>
										Upgrade to Pro
									</Link>
								)}
							</span>
						)}
					</div>
					<Link to="/repositories">
						<Button variant="ghost">Cancel</Button>
					</Link>
					<Button onClick={onConnect} loading={connectMutation.isPending}>
						{connectLabel}
					</Button>
				</div>
			</div>
		</AppShell>
	);
}

/**
 * Shown right after connecting: what happens next and the one action that
 * gets to a first audit — opening a pull request.
 */
function ConnectedNextStep({
	repos,
	auditMode,
}: {
	repos: { id: string; fullName: string }[];
	auditMode: AuditMode;
}) {
	const first = repos[0];
	return (
		<Card className="mx-auto max-w-2xl p-8">
			<CheckCircleIcon className="h-8 w-8 text-success" weight="fill" />
			<h2 className="mt-3 text-xl font-bold tracking-tight">
				{repos.length === 1
					? `${first.fullName} is connected`
					: `${repos.length} repositories connected`}
			</h2>
			<p className="mt-2 text-sm text-muted-foreground">
				{auditMode === "preview"
					? "Vitalgate added a workflow that runs when your host finishes a preview deployment for a pull request."
					: "Vitalgate added a workflow that builds and audits every pull request in GitHub Actions."}
			</p>
			<div className="mt-6 rounded-md border border-border p-4">
				<h3 className="text-sm font-semibold">
					Next: open a pull request to see it work
				</h3>
				<p className="mt-1 text-sm text-muted-foreground">
					Any small change will do. A few minutes after you open it
					{auditMode === "preview" ? " and the preview deploys" : ""}, the pull
					request gets the "Vitalgate" check and a results comment.
				</p>
				<div className="mt-4 flex flex-wrap gap-2">
					<a
						href={`https://github.com/${first.fullName}/compare`}
						target="_blank"
						rel="noreferrer"
					>
						<Button className="bg-brand text-brand-foreground hover:bg-brand/90">
							Open a pull request on GitHub
							<ArrowSquareOutIcon className="ml-1.5 h-4 w-4" />
						</Button>
					</a>
					<Link to="/repositories/$repoId" params={{ repoId: first.id }}>
						<Button variant="outline">Review its budgets</Button>
					</Link>
				</div>
			</div>
			{repos.length > 1 && (
				<ul className="mt-4 space-y-1 text-sm">
					{repos.map((r) => (
						<li key={r.id}>
							<Link
								to="/repositories/$repoId"
								params={{ repoId: r.id }}
								className="font-mono text-xs text-muted-foreground hover:text-foreground"
							>
								{r.fullName}
							</Link>
						</li>
					))}
				</ul>
			)}
		</Card>
	);
}
