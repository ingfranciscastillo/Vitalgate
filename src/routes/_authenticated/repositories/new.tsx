import {
	ArrowLeftIcon,
	BuildingsIcon,
	CaretRightIcon,
	CheckIcon,
	GitBranchIcon,
	GithubLogoIcon,
	LockIcon,
	MagnifyingGlassIcon,
	ShieldCheckIcon,
	StarIcon,
} from "@phosphor-icons/react";
import {
	useMutation,
	useQuery,
	useQueryClient,
	useSuspenseQuery,
} from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { authClient } from "@/lib/auth-client";
import { connectRepositories } from "@/lib/github.functions";
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
	const navigate = useNavigate();
	const [query, setQuery] = useState("");
	const [org, setOrg] = useState<string>("all");
	const [selected, setSelected] = useState<string[]>([]);
	const [preset, setPreset] = useState<PresetId>("default");
	const [branchProtect, setBranchProtect] = useState(true);
	const [postComments, setPostComments] = useState(true);
	const [startScript, setStartScript] = useState("");
	const [port, setPort] = useState("");
	const [envVarNames, setEnvVarNames] = useState("");
	const [shakeSummary, setShakeSummary] = useState(false);
	const [showLimitDialog, setShowLimitDialog] = useState(false);
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
			if (s.includes(id)) return s.filter((x) => x !== id);
			if (s.length >= remainingFree) {
				setShowLimitDialog(true);
				return s;
			}
			return [...s, id];
		});
	const allFilteredSelected =
		filtered.length > 0 && filtered.every((r) => selected.includes(r.id));

	const queryClient = useQueryClient();
	const connectMutation = useMutation({
		mutationFn: connectRepositories,
		onSuccess: ({
			connected,
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
			navigate({ to: "/repositories" });
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
				startScript: startScript.trim() || undefined,
				port: port.trim() ? Number(port) : undefined,
				// Left empty, the server keeps a reconnected repo's existing names.
				envVarNames: envVarNames.trim()
					? envVarNames
							.split(",")
							.map((n) => n.trim())
							.filter(Boolean)
					: undefined,
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

	return (
		<AppShell title="Connect a repository">
			<RepoLimitDialog
				open={showLimitDialog}
				onOpenChange={setShowLimitDialog}
			/>
			<div className="mb-6">
				<Link
					to="/repositories"
					className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
				>
					<ArrowLeftIcon className="h-3.5 w-3.5" /> Back to repositories
				</Link>
				<div className="mt-3 flex flex-wrap items-end justify-between gap-3">
					<div>
						<h1 className="text-2xl font-semibold tracking-tight">
							Connect a repository
						</h1>
						<p className="text-sm text-muted-foreground mt-1">
							Pick one or more repositories. Vitalgate will install the GitHub
							App, fetch the baseline, and start auditing every PR.
						</p>
					</div>
					<div className="flex items-center gap-2 text-xs text-muted-foreground">
						<ShieldCheckIcon className="h-4 w-4 text-primary" /> Minimum-scope
						GitHub App
					</div>
				</div>
			</div>

			<Tabs defaultValue="github" className="">
				<TabsList>
					<TabsTrigger value="github">
						<GithubLogoIcon className="h-3.5 w-3.5 mr-1.5" /> From GitHub
					</TabsTrigger>
					<TabsTrigger value="url">From URL</TabsTrigger>
				</TabsList>

				<TabsContent value="github" className="mt-6">
					<div className="grid lg:grid-cols-[1fr_360px] gap-6">
						<div className="space-y-4">
							<Card className="p-4">
								<div className="flex flex-wrap items-center gap-2">
									<Select value={org} onValueChange={setOrg}>
										<SelectTrigger className="w-50">
											<BuildingsIcon className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
											<SelectValue placeholder="All organizations" />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="all">All organizations</SelectItem>
											{orgs.map((o) => (
												<SelectItem key={o} value={o}>
													{o}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
									<div className="relative flex-1 min-w-55">
										<MagnifyingGlassIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
										<Input
											placeholder="Search repositories"
											value={query}
											onChange={(e) => setQuery(e.target.value)}
											className="pl-8"
										/>
									</div>
									<Button
										variant="outline"
										size="sm"
										onClick={() => {
											if (allFilteredSelected) {
												setSelected((s) =>
													s.filter((id) => !filtered.some((r) => r.id === id)),
												);
											} else {
												setSelected((s) => {
													const merged = Array.from(
														new Set([...s, ...filtered.map((r) => r.id)]),
													);
													if (merged.length > remainingFree) {
														setShowLimitDialog(true);
														return merged.slice(0, remainingFree);
													}
													return merged;
												});
											}
										}}
									>
										{allFilteredSelected ? "Clear" : "Select all"}
									</Button>
								</div>
							</Card>

							<Card className="p-0 overflow-hidden">
								<motion.ul
									className="divide-y divide-border"
									variants={staggerContainer}
									initial="hidden"
									animate="show"
								>
									{filtered.length === 0 && (
										<li className="px-5 py-10 text-center text-sm text-muted-foreground">
											No repositories match "{query}".
										</li>
									)}
									<AnimatePresence mode="popLayout">
										{filtered.map((r) => {
											const checked = selected.includes(r.id);
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
													{/*
													 * biome-ignore lint/a11y/noStaticElementInteractions: mouse-only row convenience
													 * biome-ignore lint/a11y/useKeyWithClickEvents: the Checkbox below is independently focusable and keyboard-operable
													 */}
													<div
														className={`flex items-center gap-4 px-5 py-3.5 cursor-pointer transition-colors ${
															checked
																? "bg-primary/5"
																: !checked && atLimit
																	? "opacity-50 hover:bg-transparent"
																	: "hover:bg-muted/30"
														}`}
														onClick={() => toggle(r.id)}
													>
														<Checkbox
															checked={checked}
															disabled={!checked && atLimit}
															onCheckedChange={() => toggle(r.id)}
															onClick={(e) => e.stopPropagation()}
														/>
														<div className="flex-1 min-w-0">
															<div className="flex items-center gap-2">
																<span className="font-medium font-mono text-sm truncate">
																	{r.fullName}
																</span>
																{r.private ? (
																	<span className="inline-flex items-center gap-1 rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
																		<LockIcon className="h-2.5 w-2.5" /> private
																	</span>
																) : (
																	<span className="rounded-full bg-primary/10 text-primary px-1.5 py-0.5 text-[10px]">
																		public
																	</span>
																)}
															</div>
															<div className="mt-0.5 flex items-center gap-3 text-[11px] text-muted-foreground font-mono">
																<span className="inline-flex items-center gap-1">
																	<GitBranchIcon className="h-3 w-3" />{" "}
																	{r.defaultBranch}
																</span>
																<span>{r.language}</span>
																{r.stars > 0 && (
																	<span className="inline-flex items-center gap-1">
																		<StarIcon className="h-3 w-3" /> {r.stars}
																	</span>
																)}
																<span>updated {r.updated}</span>
															</div>
														</div>
														{checked && (
															<CheckIcon className="h-4 w-4 shrink-0 animate-badge-in text-primary" />
														)}
													</div>
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

							<div className="text-xs text-muted-foreground">
								Don't see a repository?{" "}
								<a href="#permissions" className="text-primary hover:underline">
									Adjust GitHub App permissions
								</a>
								.
							</div>
						</div>

						<aside className="space-y-4">
							<Card className="p-5">
								<h2 className="font-semibold text-sm">Budget preset</h2>
								<p className="mt-1 text-xs text-muted-foreground">
									Applied to every selected repo. You can edit per-repo later.
								</p>
								<div className="mt-4 space-y-2">
									{PRESETS.map((p) => (
										<label
											key={p.id}
											className={`flex items-start gap-3 rounded-md border p-3 cursor-pointer transition-colors ${
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
											<div className="flex-1">
												<div className="flex items-center gap-2">
													<span className="text-sm font-medium">{p.label}</span>
													{p.recommended && (
														<span className="rounded-full bg-primary/15 text-primary px-1.5 py-0.5 text-[10px]">
															recommended
														</span>
													)}
												</div>
												<div className="mt-0.5 text-[11px] text-muted-foreground font-mono">
													{p.desc}
												</div>
											</div>
										</label>
									))}
								</div>
							</Card>

							<Card className="p-5">
								<h2 className="font-semibold text-sm">Options</h2>
								<div className="mt-4 space-y-3">
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
												Mark the Vitalgate check as required in GitHub to block
												merges. Unchecked, every budget is a warning.
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
												Inline metric diffs vs baseline.
											</p>
										</div>
									</div>
								</div>
							</Card>

							<Card className="p-5">
								<h2 className="font-semibold text-sm">Serve command</h2>
								<p className="mt-1 text-xs text-muted-foreground">
									Vitalgate detects a "start"/"preview"/"serve" script from each
									repo's package.json automatically. Set these to override it
									for every repository selected above.
								</p>
								<div className="mt-4 space-y-3">
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
							</Card>

							<Card className="p-5">
								<h2 className="font-semibold text-sm">Environment variables</h2>
								<p className="mt-1 text-xs text-muted-foreground">
									Comma-separated names of repo secrets the started server needs
									to boot (e.g. a database URL) — not their values. Vitalgate
									only stores the names; each becomes a{" "}
									<code className="font-mono">secrets.NAME</code> reference in
									the generated workflow, so the secret must already exist in
									this repo's own GitHub settings. Leave it empty when
									reconnecting to keep the names a repo already has.
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
							</Card>

							<Card
								className={`p-5 bg-muted/30 ${shakeSummary ? "animate-shake" : ""}`}
								onAnimationEnd={() => setShakeSummary(false)}
							>
								<div className="flex items-center justify-between text-sm">
									<span className="text-muted-foreground">Selected</span>
									<span className="font-mono font-semibold">
										{selected.length}
									</span>
								</div>
								{!pro && (
									<p className="mt-2 text-xs text-muted-foreground">
										Free plan includes {FREE_REPO_LIMIT} repository —{" "}
										{connectedCount} already connected.{" "}
										{remainingFree === 0 && (
											<Link
												to="/pricing"
												className="text-primary hover:underline"
											>
												Upgrade to Pro
											</Link>
										)}
									</p>
								)}
								<Button
									className="mt-4 w-full"
									onClick={onConnect}
									disabled={connectMutation.isPending}
								>
									{connectMutation.isPending
										? "Connecting…"
										: `Connect ${selected.length > 0 ? `${selected.length} ` : ""}repositor${selected.length === 1 ? "y" : "ies"}`}
									{!connectMutation.isPending && (
										<CaretRightIcon className="h-4 w-4 ml-1" />
									)}
								</Button>
								<Link to="/repositories" className="mt-2 block">
									<Button variant="ghost" className="w-full">
										Cancel
									</Button>
								</Link>
							</Card>
						</aside>
					</div>
				</TabsContent>

				<TabsContent value="url" className="mt-6">
					<Card className="p-6 max-w-xl">
						<h2 className="font-semibold">Connect by URL</h2>
						<p className="text-sm text-muted-foreground mt-1">
							Paste a public GitHub repository URL. Vitalgate will request
							read-only access.
						</p>
						<div className="mt-5 space-y-2">
							<Label htmlFor="url">Repository URL</Label>
							<Input
								id="url"
								placeholder="https://github.com/acme/storefront"
							/>
						</div>
						<div className="mt-5 flex justify-end gap-2">
							<Link to="/repositories">
								<Button variant="outline">Cancel</Button>
							</Link>
							<Button
								onClick={() => {
									toast.success("Repository connected");
									navigate({ to: "/repositories" });
								}}
							>
								Connect
							</Button>
						</div>
					</Card>
				</TabsContent>
			</Tabs>
		</AppShell>
	);
}
