import {
	DesktopIcon,
	DiscordLogoIcon,
	GithubLogoIcon,
	GoogleLogoIcon,
	KanbanIcon,
	MicrosoftTeamsLogoIcon,
	SlackLogoIcon,
	TicketIcon,
	WebhooksLogoIcon,
	XIcon,
} from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { ComponentType } from "react";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { AppShell } from "@/components/app-shell";
import { Reveal } from "@/components/reveal";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { authClient } from "@/lib/auth-client";
import { billingOverviewQueryOptions } from "@/lib/billing.queries";
import { timeAgo } from "@/lib/format";
import {
	disconnectIntegration,
	getGithubInstallUrl,
	getIntegrationAuthorizeUrl,
} from "@/lib/integrations.functions";
import { integrationsOverviewQueryOptions } from "@/lib/integrations.queries";
import type { IntegrationProvider } from "@/lib/mock-data";
import { EASE_IN, EASE_OUT, staggerContainer, staggerItem } from "@/lib/motion";
import { setNotificationPref } from "@/lib/notification-prefs.functions";
import { notificationPrefsQueryOptions } from "@/lib/notification-prefs.queries";
import { useIsOrgAdmin } from "@/lib/org-roles";
import { FREE_REPO_LIMIT, isPro } from "@/lib/plan";
import { orgReposQueryOptions } from "@/lib/repos.queries";
import { parseUserAgent } from "@/lib/user-agent";

export const Route = createFileRoute("/_authenticated/settings")({
	// Only read to pick the opening tab; IntegrationsTab reads the full
	// ?integration=&status=&reason= itself and then clears it.
	validateSearch: (search): { integration?: string; tab?: string } => ({
		integration:
			typeof search.integration === "string" ? search.integration : undefined,
		tab: typeof search.tab === "string" ? search.tab : undefined,
	}),
	head: () => ({ meta: [{ title: "Settings: Vitalgate" }] }),
	component: Settings,
});

function OrganizationCard() {
	const { data: org, isPending } = authClient.useActiveOrganization();
	const [name, setName] = useState("");
	const [slug, setSlug] = useState("");
	const [saving, setSaving] = useState(false);

	// Re-syncs only when the org's actual name/slug change (this page's own
	// save, or an edit made elsewhere) — not on every refetch of the org
	// object (e.g. from a member joining on the Team page), which would
	// otherwise stomp on an in-progress, unsaved edit here.
	// biome-ignore lint/correctness/useExhaustiveDependencies: see comment above
	useEffect(() => {
		if (org) {
			setName(org.name);
			setSlug(org.slug);
		}
	}, [org?.name, org?.slug]);

	const handleSave = async () => {
		setSaving(true);
		const { error } = await authClient.organization.update({
			data: { name, slug },
		});
		setSaving(false);
		if (error) {
			toast.error(error.message ?? "Could not update organization");
			return;
		}
		toast.success("Organization updated");
	};

	return (
		<Card className="p-6 max-w-xl">
			<h2 className="font-semibold">Organization</h2>
			<div className="mt-4 grid gap-4">
				<div>
					<Label htmlFor="orgname">Workspace name</Label>
					<Input
						id="orgname"
						value={name}
						onChange={(e) => setName(e.target.value)}
						disabled={isPending}
						className="mt-1.5"
					/>
				</div>
				<div>
					<Label htmlFor="slug">Slug</Label>
					<Input
						id="slug"
						value={slug}
						onChange={(e) => setSlug(e.target.value)}
						disabled={isPending}
						className="mt-1.5 font-mono"
					/>
				</div>
				<div className="pt-2">
					<Button
						onClick={handleSave}
						disabled={isPending || saving || !name.trim() || !slug.trim()}
					>
						{saving ? "Saving…" : "Save changes"}
					</Button>
				</div>
			</div>
		</Card>
	);
}

function NotificationsCard() {
	const { data: prefs, isPending } = useQuery(notificationPrefsQueryOptions());
	const queryClient = useQueryClient();
	const reduce = useReducedMotion();

	const togglePref = useMutation({
		mutationFn: setNotificationPref,
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["notification-prefs"] });
		},
		onError: () => toast.error("Could not update the preference"),
	});

	return (
		<Card className="p-6 max-w-xl">
			<h2 className="font-semibold">Notification preferences</h2>
			<p className="mt-1 text-xs text-muted-foreground">
				Personal — these don't change what the org's Alert rules fire, only
				whether you're emailed about it.
			</p>
			{isPending ? (
				<p className="mt-4 text-sm text-muted-foreground">Loading…</p>
			) : (
				<motion.ul
					className="mt-4 divide-y divide-border"
					variants={staggerContainer}
					initial="hidden"
					animate="show"
				>
					{prefs?.map((p) => (
						<motion.li
							key={p.key}
							variants={staggerItem(reduce)}
							className="flex items-center justify-between py-3"
						>
							<div>
								<span className="text-sm">{p.label}</span>
								<p className="text-xs text-muted-foreground">{p.desc}</p>
							</div>
							<Switch
								aria-label={p.label}
								checked={p.enabled}
								disabled={togglePref.isPending}
								onCheckedChange={(enabled) =>
									togglePref.mutate({
										data: { pref: p.key, enabled: Boolean(enabled) },
									})
								}
							/>
						</motion.li>
					))}
				</motion.ul>
			)}
		</Card>
	);
}

function IntegrationCardShell({
	icon: Icon,
	name,
	connected,
	desc,
	proLocked,
	children,
}: {
	icon: ComponentType<{ className?: string }>;
	name: string;
	connected: boolean;
	desc: string;
	/** Shows a "Pro" badge instead of "Connected" — the org can see the card but can't connect yet. */
	proLocked?: boolean;
	children: React.ReactNode;
}) {
	return (
		<Card className="p-5">
			<div className="flex items-start gap-3">
				<div className="h-9 w-9 rounded-md bg-muted grid place-items-center">
					<Icon className="h-4 w-4" />
				</div>
				<div className="flex-1">
					<div className="flex items-center gap-2">
						<span className="font-medium">{name}</span>
						{connected && (
							<span className="animate-badge-in rounded-full bg-success/15 text-success px-2 py-0.5 text-[10px]">
								Connected
							</span>
						)}
						{!connected && proLocked && (
							<span className="rounded-full bg-brand/15 text-brand px-2 py-0.5 text-[10px] font-medium">
								Pro
							</span>
						)}
					</div>
					<p className="text-xs text-muted-foreground mt-1">{desc}</p>
				</div>
			</div>
			<div className="mt-4">{children}</div>
		</Card>
	);
}

function IntegrationsTab() {
	const { data, isPending } = useQuery(integrationsOverviewQueryOptions());
	const queryClient = useQueryClient();
	const [connecting, setConnecting] = useState<
		IntegrationProvider | "github" | null
	>(null);
	const reduce = useReducedMotion();

	// The OAuth callback redirects back here with ?integration=&status=&reason=
	// — surface that once, then strip it so a refresh doesn't re-toast it.
	useEffect(() => {
		const params = new URLSearchParams(window.location.search);
		const integration = params.get("integration");
		const status = params.get("status");
		if (!integration || !status) return;

		const providerName =
			integration === "slack"
				? "Slack"
				: integration === "discord"
					? "Discord"
					: "GitHub";
		if (status === "connected") {
			toast.success(`${providerName} connected`);
		} else {
			const reason = params.get("reason");
			toast.error(
				`Could not connect ${providerName}${reason ? `: ${reason}` : ""}`,
			);
		}
		queryClient.invalidateQueries({ queryKey: ["integrations-overview"] });
		window.history.replaceState({}, "", window.location.pathname);
	}, [queryClient]);

	const isAdmin = useIsOrgAdmin();

	const disconnect = useMutation({
		mutationFn: disconnectIntegration,
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["integrations-overview"] });
			toast.success("Disconnected");
		},
		onError: (err) =>
			toast.error(err instanceof Error ? err.message : "Could not disconnect"),
	});

	const installGithubApp = async () => {
		setConnecting("github");
		try {
			window.location.href = await getGithubInstallUrl({ data: "settings" });
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Could not open GitHub");
			setConnecting(null);
		}
	};

	const connect = async (provider: IntegrationProvider) => {
		setConnecting(provider);
		try {
			const url = await getIntegrationAuthorizeUrl({ data: provider });
			window.location.href = url;
		} catch (err) {
			toast.error(
				err instanceof Error ? err.message : "Could not start connection",
			);
			setConnecting(null);
		}
	};

	if (isPending || !data) {
		return <p className="mt-6 text-sm text-muted-foreground">Loading…</p>;
	}

	return (
		<>
			{isAdmin === false && (
				<p className="mt-6 text-xs text-muted-foreground">
					Only workspace owners and admins can connect or disconnect
					integrations.
				</p>
			)}
			<motion.div
				className="mt-6 grid sm:grid-cols-2 gap-4 max-w-3xl"
				variants={staggerContainer}
				initial="hidden"
				animate="show"
			>
				<motion.div variants={staggerItem(reduce)}>
					<IntegrationCardShell
						icon={GithubLogoIcon}
						name="GitHub"
						connected={data.github.installations.length > 0}
						desc={
							data.github.installations.length > 0
								? `App installed on ${data.github.installations.map((i) => `@${i.accountLogin}`).join(", ")} · ${data.github.repoCount} repo${data.github.repoCount === 1 ? "" : "s"} connected`
								: "Install the Vitalgate GitHub App to choose which repos it can access."
						}
					>
						<div className="flex flex-wrap gap-2">
							{data.github.appConfigured && (
								<Button
									size="sm"
									variant={
										data.github.installations.length > 0 ? "outline" : "default"
									}
									disabled={connecting === "github" || !isAdmin}
									onClick={installGithubApp}
								>
									{connecting === "github"
										? "Opening GitHub…"
										: data.github.installations.length > 0
											? "Add account or repos"
											: "Install GitHub App"}
								</Button>
							)}
							<Link to="/repositories">
								<Button variant="outline" size="sm">
									Manage repos
								</Button>
							</Link>
						</div>
					</IntegrationCardShell>
				</motion.div>

				<motion.div variants={staggerItem(reduce)}>
					<IntegrationCardShell
						icon={SlackLogoIcon}
						name="Slack"
						connected={data.slack.connected}
						proLocked={!isPro(data.plan)}
						desc={
							data.slack.connected
								? (data.slack.label ?? "Connected")
								: isPro(data.plan)
									? "Not connected"
									: "Upgrade to Pro to connect Slack"
						}
					>
						{data.slack.connected ? (
							<Button
								variant="outline"
								size="sm"
								disabled={disconnect.isPending || !isAdmin}
								onClick={() => disconnect.mutate({ data: "slack" })}
							>
								Disconnect
							</Button>
						) : isPro(data.plan) ? (
							<Button
								size="sm"
								disabled={connecting === "slack" || !isAdmin}
								onClick={() => connect("slack")}
							>
								{connecting === "slack" ? "Connecting…" : "Connect"}
							</Button>
						) : (
							<Link to="/settings" search={{ tab: "billing" }}>
								<Button variant="outline" size="sm">
									Upgrade to Pro
								</Button>
							</Link>
						)}
					</IntegrationCardShell>
				</motion.div>

				<motion.div variants={staggerItem(reduce)}>
					<IntegrationCardShell
						icon={DiscordLogoIcon}
						name="Discord"
						connected={data.discord.connected}
						proLocked={!isPro(data.plan)}
						desc={
							data.discord.connected
								? (data.discord.label ?? "Connected")
								: isPro(data.plan)
									? "Not connected"
									: "Upgrade to Pro to connect Discord"
						}
					>
						{data.discord.connected ? (
							<Button
								variant="outline"
								size="sm"
								disabled={disconnect.isPending || !isAdmin}
								onClick={() => disconnect.mutate({ data: "discord" })}
							>
								Disconnect
							</Button>
						) : isPro(data.plan) ? (
							<Button
								size="sm"
								disabled={connecting === "discord" || !isAdmin}
								onClick={() => connect("discord")}
							>
								{connecting === "discord" ? "Connecting…" : "Connect"}
							</Button>
						) : (
							<Link to="/settings" search={{ tab: "billing" }}>
								<Button variant="outline" size="sm">
									Upgrade to Pro
								</Button>
							</Link>
						)}
					</IntegrationCardShell>
				</motion.div>
			</motion.div>

			<section className="mt-8 max-w-3xl">
				<h2 className="text-sm font-semibold">Coming soon</h2>
				<ul className="mt-3 grid gap-3 sm:grid-cols-2">
					{UPCOMING_INTEGRATIONS.map(({ icon: Icon, name, desc }) => (
						<li
							key={name}
							className="flex items-start gap-3 rounded-md border border-dashed border-border p-4"
						>
							<div className="h-8 w-8 shrink-0 rounded-md bg-muted grid place-items-center text-muted-foreground">
								<Icon className="h-4 w-4" />
							</div>
							<div>
								<div className="text-sm font-medium">{name}</div>
								<p className="mt-0.5 text-xs text-muted-foreground">{desc}</p>
							</div>
						</li>
					))}
				</ul>
			</section>
		</>
	);
}

/** Planned integrations, listed so workspaces know what's next. Not connectable yet. */
const UPCOMING_INTEGRATIONS: {
	icon: ComponentType<{ className?: string }>;
	name: string;
	desc: string;
}[] = [
	{
		icon: MicrosoftTeamsLogoIcon,
		name: "Microsoft Teams",
		desc: "Budget alerts in a Teams channel.",
	},
	{
		icon: GoogleLogoIcon,
		name: "Google Chat",
		desc: "Budget alerts in a Google Chat space.",
	},
	{
		icon: KanbanIcon,
		name: "Linear",
		desc: "Open an issue when a required budget fails on the default branch.",
	},
	{
		icon: TicketIcon,
		name: "Jira",
		desc: "Create a ticket for each regression, linked to its pull request.",
	},
	{
		icon: WebhooksLogoIcon,
		name: "Webhooks",
		desc: "POST every alert as JSON to a URL you choose.",
	},
];

/**
 * better-auth's /list-sessions requires a "fresh" session (created within
 * the last 24h — see session config's freshAge) and throws
 * SESSION_NOT_FRESH otherwise. Our only sign-in is GitHub OAuth, so a user
 * who's been in the app for a few days without re-authenticating will hit
 * that on this tab. revokeOtherSessions doesn't share that requirement, so
 * the "sign out everywhere else" action still works even when the list
 * itself can't load — the fallback below leans on that instead of just
 * showing an error.
 */
function SessionsCard() {
	const queryClient = useQueryClient();
	const { data: current } = authClient.useSession();
	const [confirmingRevokeAll, setConfirmingRevokeAll] = useState(false);
	const [revokingToken, setRevokingToken] = useState<string | null>(null);

	const {
		data: sessions,
		isPending,
		error,
	} = useQuery({
		queryKey: ["sessions"],
		queryFn: async () => {
			const { data, error } = await authClient.listSessions();
			if (error) throw new Error(error.message ?? "Could not load sessions");
			return data;
		},
		retry: false,
	});

	const revokeOne = async (token: string) => {
		setRevokingToken(token);
		const { error } = await authClient.revokeSession({ token });
		setRevokingToken(null);
		if (error) {
			toast.error(error.message ?? "Could not revoke session");
			return;
		}
		toast.success("Session revoked");
		queryClient.invalidateQueries({ queryKey: ["sessions"] });
	};

	const revokeOthers = useMutation({
		mutationFn: async () => {
			const { error } = await authClient.revokeOtherSessions();
			if (error) throw new Error(error.message ?? "Could not revoke sessions");
		},
		onSuccess: () => {
			toast.success("Signed out of all other devices");
			queryClient.invalidateQueries({ queryKey: ["sessions"] });
			setConfirmingRevokeAll(false);
		},
		onError: (err: Error) => toast.error(err.message),
	});

	const others = sessions?.filter((s) => s.token !== current?.session.token);

	return (
		<Card className="p-6 max-w-xl">
			<div className="flex items-center justify-between">
				<h2 className="font-semibold">Active sessions</h2>
				{(others === undefined || others.length > 0) && (
					<AnimatePresence mode="wait" initial={false}>
						{confirmingRevokeAll ? (
							<motion.div
								key="confirm"
								initial={{ opacity: 0, y: -4 }}
								animate={{ opacity: 1, y: 0 }}
								exit={{ opacity: 0, y: -4 }}
								transition={{ duration: 0.15, ease: EASE_OUT }}
								className="flex items-center gap-2"
							>
								<span className="text-xs font-medium">Sure?</span>
								<Button
									variant="destructive"
									size="sm"
									disabled={revokeOthers.isPending}
									onClick={() => revokeOthers.mutate()}
								>
									{revokeOthers.isPending ? "Signing out…" : "Yes"}
								</Button>
								<Button
									variant="ghost"
									size="sm"
									disabled={revokeOthers.isPending}
									onClick={() => setConfirmingRevokeAll(false)}
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
									variant="outline"
									size="sm"
									onClick={() => setConfirmingRevokeAll(true)}
								>
									Sign out of all other devices
								</Button>
							</motion.div>
						)}
					</AnimatePresence>
				)}
			</div>

			{isPending ? (
				<p className="mt-4 text-sm text-muted-foreground">Loading…</p>
			) : error ? (
				<p className="mt-4 text-xs text-muted-foreground">
					Couldn't load the list — that needs a recent sign-in. You can still
					sign out of every other device with the button above.
				</p>
			) : (
				<ul className="mt-4 divide-y divide-border">
					{sessions?.map((s) => {
						const isCurrent = s.token === current?.session.token;
						return (
							<li key={s.id} className="flex items-center gap-3 py-3">
								<div className="h-9 w-9 shrink-0 rounded-md bg-muted grid place-items-center">
									<DesktopIcon className="h-4 w-4 text-muted-foreground" />
								</div>
								<div className="flex-1 min-w-0">
									<div className="flex items-center gap-2">
										<span className="text-sm font-medium truncate">
											{parseUserAgent(s.userAgent)}
										</span>
										{isCurrent && (
											<span className="rounded-full bg-success/15 text-success px-2 py-0.5 text-[10px] font-medium shrink-0">
												This device
											</span>
										)}
									</div>
									<div className="text-xs text-muted-foreground font-mono truncate">
										{s.ipAddress ?? "unknown IP"} · active{" "}
										{timeAgo(s.updatedAt)}
									</div>
								</div>
								{!isCurrent && (
									<Button
										type="button"
										size="icon-sm"
										variant="ghost"
										className="group shrink-0"
										aria-label="Revoke session"
										disabled={revokingToken === s.token}
										onClick={() => revokeOne(s.token)}
									>
										<XIcon className="h-3.5 w-3.5 text-destructive transition-transform duration-150 ease-out group-hover:scale-110 group-active:scale-90" />
									</Button>
								)}
							</li>
						);
					})}
				</ul>
			)}
		</Card>
	);
}

/**
 * There's no billing provider wired up yet — plan is a manually-set field on
 * the organization (see src/lib/plan.ts) that the rest of the app already
 * enforces (repo limit, Slack/Discord, custom alert rules). This just
 * reflects that real state instead of the fabricated "$149/mo Team" data
 * this tab used to show.
 */
function BillingCard() {
	const { data: repos, isPending } = useQuery(orgReposQueryOptions());
	const { data: org, refetch: refetchOrg } = authClient.useActiveOrganization();
	const isAdmin = useIsOrgAdmin();
	const [justPaid] = useState(
		() =>
			typeof window !== "undefined" &&
			new URLSearchParams(window.location.search).get("checkout") === "success",
	);
	// After checkout, Polar's webhook usually lands within seconds: poll
	// until the workspace shows Pro, for up to a minute.
	const [pollUntil] = useState(() => (justPaid ? Date.now() + 60_000 : 0));
	const { data: billing } = useQuery({
		...billingOverviewQueryOptions(),
		refetchInterval: (query) =>
			query.state.data?.plan !== "pro" && Date.now() < pollUntil ? 2000 : false,
	});
	const [redirecting, setRedirecting] = useState<"checkout" | "portal" | null>(
		null,
	);

	useEffect(() => {
		if (!justPaid) return;
		toast.success("Payment received. Pro turns on in a few seconds.");
		window.history.replaceState({}, "", "/settings?tab=billing");
	}, [justPaid]);

	const pro = isPro(billing?.plan ?? org?.plan);
	// Keeps the plan badge elsewhere (sidebar, limits) in step once Pro lands.
	useEffect(() => {
		if (billing?.plan && org && billing.plan !== org.plan) refetchOrg();
	}, [billing?.plan, org, refetchOrg]);

	const repoCount = repos?.length ?? 0;
	const overLimit = !pro && repoCount > FREE_REPO_LIMIT;
	const sub = billing?.subscription;

	const upgrade = async () => {
		if (!org) return;
		setRedirecting("checkout");
		const { error } = await authClient.checkout({
			slug: "pro",
			reference_id: org.id,
		});
		if (error) {
			toast.error(error.message ?? "Could not open checkout");
			setRedirecting(null);
		}
	};

	const manage = async () => {
		setRedirecting("portal");
		const { error } = await authClient.customer.portal();
		if (error) {
			toast.error(error.message ?? "Could not open billing");
			setRedirecting(null);
		}
	};

	const periodEnd = sub?.currentPeriodEnd
		? new Date(sub.currentPeriodEnd).toLocaleDateString("en-US", {
				month: "long",
				day: "numeric",
				year: "numeric",
			})
		: null;

	return (
		<Card className="p-6 max-w-xl">
			<div className="flex items-center justify-between">
				<div>
					<h2 className="font-semibold">Current plan</h2>
					<p className="text-sm text-muted-foreground">
						{pro ? "Pro" : "Free"}
					</p>
				</div>
				<span className="font-mono text-2xl font-semibold">
					{pro ? "$29" : "$0"}
					<span className="text-muted-foreground text-sm">/mo</span>
				</span>
			</div>

			{pro && sub && (
				<p
					className={`mt-3 text-sm ${sub.status === "past_due" ? "text-destructive" : "text-muted-foreground"}`}
				>
					{sub.status === "past_due"
						? "Your last payment failed. Update your card to stay on Pro."
						: sub.cancelAtPeriodEnd && periodEnd
							? `Canceled. Pro stays on until ${periodEnd}.`
							: periodEnd
								? `Renews on ${periodEnd}.`
								: null}
				</p>
			)}
			{pro && !sub && (
				<p className="mt-3 text-sm text-muted-foreground">
					Pro was turned on for this workspace without a subscription.
				</p>
			)}

			<div className="mt-6">
				<div className="text-xs text-muted-foreground">
					Repositories connected
				</div>
				<div className="font-mono mt-1">
					{isPending ? "…" : repoCount}
					{!pro && (
						<span className="text-muted-foreground text-sm">
							{" "}
							/ {FREE_REPO_LIMIT} included free
						</span>
					)}
				</div>
				{overLimit && (
					<p className="mt-2 text-xs text-warning-foreground">
						You're over the Free plan's repo limit — upgrade to Pro for
						unlimited repositories.
					</p>
				)}
			</div>

			<div className="mt-6 flex flex-wrap items-center gap-3">
				{!pro && billing?.configured && isAdmin && (
					<Button
						className="bg-brand text-brand-foreground hover:bg-brand/90"
						disabled={redirecting !== null || justPaid}
						onClick={upgrade}
					>
						{redirecting === "checkout"
							? "Opening checkout…"
							: justPaid
								? "Activating Pro…"
								: "Upgrade to Pro, $29/month"}
					</Button>
				)}
				{pro && sub?.managedByYou && (
					<Button
						variant="outline"
						disabled={redirecting !== null}
						onClick={manage}
					>
						{redirecting === "portal"
							? "Opening billing…"
							: "Manage billing and invoices"}
					</Button>
				)}
				{pro && sub && !sub.managedByYou && (
					<p className="text-xs text-muted-foreground">
						Billing is managed by the person who subscribed.
					</p>
				)}
				{!pro && isAdmin === false && (
					<p className="text-xs text-muted-foreground">
						Ask a workspace owner or admin to upgrade.
					</p>
				)}
				{!pro && (
					<Link to="/pricing">
						<Button variant="outline">Compare plans</Button>
					</Link>
				)}
			</div>
			{!pro && billing && !billing.configured && isAdmin && (
				<p className="mt-3 text-xs text-warning-foreground">
					Online payments aren't set up on this server yet, so Pro can't be
					bought here.
				</p>
			)}
			{!pro && billing?.configured && isAdmin && (
				<p className="mt-3 text-xs text-muted-foreground">
					Billed monthly through Polar, our payment provider, which handles
					taxes and invoices. Cancel any time from the billing portal.
				</p>
			)}
		</Card>
	);
}

function Settings() {
	const { integration, tab } = Route.useSearch();
	const initialTab = integration
		? "integrations"
		: tab === "billing" || tab === "notifications"
			? tab
			: "org";
	return (
		<AppShell title="Settings">
			{/* Integration callbacks land on ?integration=…; open that tab so its toast shows. */}
			{/* Keyed so an in-page link to ?tab=billing switches tabs too. */}
			<Tabs key={initialTab} defaultValue={initialTab}>
				<TabsList>
					<TabsTrigger value="org">Organization</TabsTrigger>
					<TabsTrigger value="integrations">Integrations</TabsTrigger>
					<TabsTrigger value="billing">Billing</TabsTrigger>
					<TabsTrigger value="notifications">Notifications</TabsTrigger>
					<TabsTrigger value="security">Security</TabsTrigger>
				</TabsList>

				<TabsContent value="org" className="mt-6 space-y-4">
					<Reveal>
						<OrganizationCard />
					</Reveal>
				</TabsContent>

				<TabsContent value="integrations">
					<IntegrationsTab />
				</TabsContent>

				<TabsContent value="billing" className="mt-6">
					<Reveal>
						<BillingCard />
					</Reveal>
				</TabsContent>

				<TabsContent value="notifications" className="mt-6">
					<Reveal>
						<NotificationsCard />
					</Reveal>
				</TabsContent>

				<TabsContent value="security" className="mt-6 space-y-4">
					<Reveal>
						<SessionsCard />
					</Reveal>
				</TabsContent>
			</Tabs>
		</AppShell>
	);
}
