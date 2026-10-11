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
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
	deleteMyAccount,
	getAccountDeletionPreview,
} from "@/lib/account.functions";
import { authClient } from "@/lib/auth-client";
import { billingOverviewQueryOptions } from "@/lib/billing.queries";
import { timeAgo } from "@/lib/format";
import {
	chooseLinearTeam,
	connectChatWebhook,
	connectWebhook,
	disconnectIntegration,
	getGithubInstallUrl,
	getIntegrationAuthorizeUrl,
	getLinearTeams,
	getWebhookSecret,
	type IntegrationsOverview,
	sendTestChatMessage,
	sendTestWebhook,
} from "@/lib/integrations.functions";
import { integrationsOverviewQueryOptions } from "@/lib/integrations.queries";
import type {
	IntegrationProvider,
	OAuthIntegrationProvider,
	PastedChatProvider,
} from "@/lib/mock-data";
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
						loading={saving}
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
				<ul className="mt-4 divide-y divide-border">
					{[0, 1, 2, 3, 4].map((i) => (
						<li key={i} className="flex items-center justify-between py-3">
							<div className="space-y-1.5">
								<Skeleton className="h-3.5 w-40" />
								<Skeleton className="h-3 w-64" />
							</div>
							<Skeleton className="h-5 w-9 rounded-full" />
						</li>
					))}
				</ul>
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
		<Card className="flex h-full flex-col p-5">
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
			<div className="mt-auto pt-4">{children}</div>
		</Card>
	);
}

const CHAT_PROVIDERS: Record<
	PastedChatProvider,
	{
		name: string;
		icon: ComponentType<{ className?: string }>;
		placeholder: string;
		howTo: string;
	}
> = {
	teams: {
		name: "Microsoft Teams",
		icon: MicrosoftTeamsLogoIcon,
		placeholder: "https://….logic.azure.com/workflows/…",
		howTo:
			'In the Teams channel: ⋯ → Workflows → "Post to a channel when a webhook request is received". Finish the steps and paste the URL it gives you.',
	},
	google_chat: {
		name: "Google Chat",
		icon: GoogleLogoIcon,
		placeholder: "https://chat.googleapis.com/v1/spaces/…",
		howTo:
			"In the Google Chat space: space name → Apps & integrations → Webhooks → Add webhook, then paste its URL. Needs a Google Workspace account.",
	},
};

/** Teams or Google Chat: connected by pasting the channel's incoming-webhook URL. Pro only. */
function ChatWebhookCard({
	provider,
	connected,
	pro,
	isAdmin,
}: {
	provider: PastedChatProvider;
	connected: boolean;
	pro: boolean;
	isAdmin: boolean;
}) {
	const meta = CHAT_PROVIDERS[provider];
	const queryClient = useQueryClient();
	const [url, setUrl] = useState("");
	const [editing, setEditing] = useState(false);

	const connect = useMutation({
		mutationFn: connectChatWebhook,
		onSuccess: () => {
			setEditing(false);
			setUrl("");
			queryClient.invalidateQueries({ queryKey: ["integrations-overview"] });
			toast.success(`${meta.name} connected`);
		},
		onError: (err) =>
			toast.error(err instanceof Error ? err.message : "Could not connect"),
	});
	const test = useMutation({
		mutationFn: sendTestChatMessage,
		onSuccess: ({ status }) =>
			status >= 200 && status < 300
				? toast.success(`Test message sent to ${meta.name}`)
				: toast.error(`${meta.name} answered HTTP ${status}`),
		onError: (err) =>
			toast.error(err instanceof Error ? err.message : "Test failed"),
	});
	const disconnect = useMutation({
		mutationFn: disconnectIntegration,
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["integrations-overview"] });
			toast.success(`${meta.name} disconnected`);
		},
		onError: () => toast.error("Could not disconnect"),
	});

	return (
		<IntegrationCardShell
			icon={meta.icon}
			name={meta.name}
			connected={connected}
			proLocked={!pro}
			desc={
				connected
					? "Budget alerts are posted to your channel."
					: pro
						? meta.howTo
						: `Upgrade to Pro to connect ${meta.name}`
			}
		>
			{!pro ? (
				<Link to="/settings" search={{ tab: "billing" }}>
					<Button variant="outline" size="sm">
						Upgrade to Pro
					</Button>
				</Link>
			) : !connected || editing ? (
				<form
					className="flex flex-col gap-2 sm:flex-row"
					onSubmit={(e) => {
						e.preventDefault();
						connect.mutate({ data: { provider, url } });
					}}
				>
					<Input
						type="url"
						inputMode="url"
						placeholder={meta.placeholder}
						aria-label={`${meta.name} webhook URL`}
						value={url}
						onChange={(e) => setUrl(e.target.value)}
						className="font-mono text-xs"
					/>
					<Button
						type="submit"
						size="sm"
						loading={connect.isPending}
						disabled={!url.trim() || !isAdmin}
					>
						{connect.isPending ? "Connecting…" : "Connect"}
					</Button>
				</form>
			) : (
				<div className="flex flex-wrap gap-2">
					<Button
						size="sm"
						variant="outline"
						loading={test.isPending}
						disabled={!isAdmin}
						onClick={() => test.mutate({ data: provider })}
					>
						{test.isPending ? "Sending…" : "Send test message"}
					</Button>
					<Button
						size="sm"
						variant="ghost"
						disabled={!isAdmin}
						onClick={() => setEditing(true)}
					>
						Change URL
					</Button>
					<Button
						size="sm"
						variant="ghost"
						loading={disconnect.isPending}
						disabled={!isAdmin}
						onClick={() => disconnect.mutate({ data: provider })}
					>
						Disconnect
					</Button>
				</div>
			)}
		</IntegrationCardShell>
	);
}

/**
 * Linear: connected through OAuth, then pointed at a team. A pull request
 * that breaks a required budget gets one issue there. Pro only.
 */
function LinearCard({
	linear,
	pro,
	isAdmin,
	connecting,
	onConnect,
}: {
	linear: IntegrationsOverview["linear"];
	pro: boolean;
	isAdmin: boolean;
	connecting: boolean;
	onConnect: () => void;
}) {
	const queryClient = useQueryClient();
	const [choosing, setChoosing] = useState(false);
	const [teamId, setTeamId] = useState("");
	const pickTeam = linear.connected && (choosing || !linear.team);

	const teams = useQuery({
		queryKey: ["linear-teams"],
		queryFn: () => getLinearTeams(),
		enabled: pickTeam && isAdmin,
		staleTime: 60_000,
	});
	const save = useMutation({
		mutationFn: chooseLinearTeam,
		onSuccess: () => {
			setChoosing(false);
			queryClient.invalidateQueries({ queryKey: ["integrations-overview"] });
			toast.success("Linear team saved");
		},
		onError: (err) =>
			toast.error(err instanceof Error ? err.message : "Could not save"),
	});
	const disconnect = useMutation({
		mutationFn: disconnectIntegration,
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["integrations-overview"] });
			toast.success("Linear disconnected");
		},
		onError: () => toast.error("Could not disconnect"),
	});

	return (
		<IntegrationCardShell
			icon={KanbanIcon}
			name="Linear"
			connected={linear.connected}
			proLocked={!pro}
			desc={
				!linear.configured
					? "Not available on this server yet."
					: linear.connected
						? linear.team
							? `A pull request that breaks a required budget gets an issue in ${linear.team}.`
							: `${linear.label ?? "Connected"}. Choose the team issues go to.`
						: pro
							? "Open an issue when a pull request breaks a required budget."
							: "Upgrade to Pro to file issues in Linear"
			}
		>
			{!linear.configured ? null : !pro ? (
				<Link to="/settings" search={{ tab: "billing" }}>
					<Button variant="outline" size="sm">
						Upgrade to Pro
					</Button>
				</Link>
			) : !linear.connected ? (
				<Button
					size="sm"
					loading={connecting}
					disabled={!isAdmin}
					onClick={onConnect}
				>
					{connecting ? "Connecting…" : "Connect"}
				</Button>
			) : pickTeam ? (
				<form
					className="flex flex-col gap-2 sm:flex-row"
					onSubmit={(e) => {
						e.preventDefault();
						const team = teams.data?.find((t) => t.id === teamId);
						if (team) save.mutate({ data: team });
					}}
				>
					{teams.isPending ? (
						<Skeleton className="h-9 flex-1" />
					) : (
						<select
							aria-label="Linear team"
							value={teamId}
							onChange={(e) => setTeamId(e.target.value)}
							className="h-9 flex-1 rounded-md border border-input bg-background px-3 text-sm"
						>
							<option value="">Choose a team…</option>
							{teams.data?.map((t) => (
								<option key={t.id} value={t.id}>
									{t.name}
								</option>
							))}
						</select>
					)}
					<Button
						type="submit"
						size="sm"
						loading={save.isPending}
						disabled={!teamId || !isAdmin}
					>
						Save
					</Button>
				</form>
			) : (
				<div className="flex flex-wrap gap-2">
					<Button
						size="sm"
						variant="outline"
						disabled={!isAdmin}
						onClick={() => setChoosing(true)}
					>
						Change team
					</Button>
					<Button
						size="sm"
						variant="ghost"
						loading={disconnect.isPending}
						disabled={!isAdmin}
						onClick={() => disconnect.mutate({ data: "linear" })}
					>
						Disconnect
					</Button>
				</div>
			)}
		</IntegrationCardShell>
	);
}

/**
 * Outgoing webhook: paste an https URL, get a signing secret, receive every
 * alert as signed JSON. Pro only, like Slack and Discord.
 */
function WebhookCard({
	connected,
	label,
	pro,
	isAdmin,
}: {
	connected: boolean;
	label: string | null;
	pro: boolean;
	isAdmin: boolean;
}) {
	const queryClient = useQueryClient();
	const [url, setUrl] = useState("");
	const [editing, setEditing] = useState(false);
	const [secret, setSecret] = useState<string | null>(null);

	const connect = useMutation({
		mutationFn: connectWebhook,
		onSuccess: ({ secret }) => {
			setSecret(secret);
			setEditing(false);
			setUrl("");
			queryClient.invalidateQueries({ queryKey: ["integrations-overview"] });
			toast.success("Webhook connected");
		},
		onError: (err) =>
			toast.error(
				err instanceof Error ? err.message : "Could not connect the webhook",
			),
	});
	const test = useMutation({
		mutationFn: sendTestWebhook,
		onSuccess: ({ status }) =>
			status >= 200 && status < 300
				? toast.success(`Test event delivered (HTTP ${status})`)
				: toast.error(`Your endpoint answered HTTP ${status}`),
		onError: (err) =>
			toast.error(err instanceof Error ? err.message : "Test failed"),
	});
	const reveal = useMutation({
		mutationFn: getWebhookSecret,
		onSuccess: (s) => setSecret(s),
		onError: () => toast.error("Could not load the signing secret"),
	});
	const disconnect = useMutation({
		mutationFn: disconnectIntegration,
		onSuccess: () => {
			setSecret(null);
			queryClient.invalidateQueries({ queryKey: ["integrations-overview"] });
			toast.success("Webhook disconnected");
		},
		onError: () => toast.error("Could not disconnect"),
	});

	const form = (
		<form
			className="flex flex-col gap-2 sm:flex-row"
			onSubmit={(e) => {
				e.preventDefault();
				connect.mutate({ data: { url } });
			}}
		>
			<Input
				type="url"
				inputMode="url"
				placeholder="https://example.com/hooks/vitalgate"
				aria-label="Webhook URL"
				value={url}
				onChange={(e) => setUrl(e.target.value)}
				className="font-mono text-xs"
			/>
			<Button
				type="submit"
				size="sm"
				loading={connect.isPending}
				disabled={!url.trim() || !isAdmin}
			>
				{connect.isPending ? "Connecting…" : "Connect"}
			</Button>
		</form>
	);

	return (
		<IntegrationCardShell
			icon={WebhooksLogoIcon}
			name="Webhook"
			connected={connected}
			proLocked={!pro}
			desc={
				connected
					? `Every alert is POSTed as signed JSON to ${label ?? "your endpoint"}.`
					: pro
						? "POST every alert as signed JSON to a URL you choose."
						: "Upgrade to Pro to send alerts to your own endpoint"
			}
		>
			{!pro ? (
				<Link to="/settings" search={{ tab: "billing" }}>
					<Button variant="outline" size="sm">
						Upgrade to Pro
					</Button>
				</Link>
			) : !connected || editing ? (
				form
			) : (
				<div className="space-y-3">
					<div className="flex flex-wrap gap-2">
						<Button
							size="sm"
							variant="outline"
							loading={test.isPending}
							disabled={!isAdmin}
							onClick={() => test.mutate({})}
						>
							{test.isPending ? "Sending…" : "Send test event"}
						</Button>
						{!secret && (
							<Button
								size="sm"
								variant="outline"
								loading={reveal.isPending}
								disabled={!isAdmin}
								onClick={() => reveal.mutate({})}
							>
								Show signing secret
							</Button>
						)}
						<Button
							size="sm"
							variant="ghost"
							disabled={!isAdmin}
							onClick={() => setEditing(true)}
						>
							Change URL
						</Button>
						<Button
							size="sm"
							variant="ghost"
							loading={disconnect.isPending}
							disabled={!isAdmin}
							onClick={() => disconnect.mutate({ data: "webhook" })}
						>
							Disconnect
						</Button>
					</div>
				</div>
			)}
			{secret && pro && (
				<div className="mt-3 rounded-md border border-border bg-muted/40 p-3">
					<div className="flex items-center justify-between gap-2">
						<span className="text-xs font-medium">Signing secret</span>
						<Button
							size="xs"
							variant="ghost"
							onClick={() => {
								navigator.clipboard
									.writeText(secret)
									.then(() => toast.success("Copied"));
							}}
						>
							Copy
						</Button>
					</div>
					<code className="mt-1 block break-all font-mono text-xs">
						{secret}
					</code>
					<p className="mt-2 text-xs text-muted-foreground">
						Each request carries{" "}
						<code className="font-mono">X-Vitalgate-Signature: v1=…</code>, the
						HMAC-SHA256 of{" "}
						<code className="font-mono">
							{"{X-Vitalgate-Timestamp}.{raw body}"}
						</code>{" "}
						with this secret. Reject requests whose signature doesn't match or
						whose timestamp is more than 5 minutes old. Changing the URL creates
						a new secret.
					</p>
				</div>
			)}
		</IntegrationCardShell>
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
					: integration === "linear"
						? "Linear"
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

	const connect = async (provider: OAuthIntegrationProvider) => {
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
		return (
			<div className="mt-6 grid max-w-3xl gap-4 sm:grid-cols-2">
				{[0, 1, 2].map((i) => (
					<Card key={i} className="p-5">
						<div className="flex items-start gap-3">
							<Skeleton className="size-9" />
							<div className="flex-1 space-y-2">
								<Skeleton className="h-4 w-24" />
								<Skeleton className="h-3 w-full" />
							</div>
						</div>
						<Skeleton className="mt-4 h-8 w-28" />
					</Card>
				))}
			</div>
		);
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
				<motion.div variants={staggerItem(reduce)} className="h-full">
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
									loading={connecting === "github"}
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

				<motion.div variants={staggerItem(reduce)} className="h-full">
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
								loading={connecting === "slack"}
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

				<motion.div variants={staggerItem(reduce)} className="h-full">
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
								loading={connecting === "discord"}
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

				<motion.div variants={staggerItem(reduce)} className="h-full">
					<ChatWebhookCard
						provider="teams"
						connected={data.teams.connected}
						pro={isPro(data.plan)}
						isAdmin={isAdmin === true}
					/>
				</motion.div>

				<motion.div variants={staggerItem(reduce)} className="h-full">
					<ChatWebhookCard
						provider="google_chat"
						connected={data.googleChat.connected}
						pro={isPro(data.plan)}
						isAdmin={isAdmin === true}
					/>
				</motion.div>

				<motion.div variants={staggerItem(reduce)} className="h-full">
					<LinearCard
						linear={data.linear}
						pro={isPro(data.plan)}
						isAdmin={isAdmin === true}
						connecting={connecting === "linear"}
						onConnect={() => connect("linear")}
					/>
				</motion.div>

				<motion.div variants={staggerItem(reduce)} className="h-full">
					<WebhookCard
						connected={data.webhook.connected}
						label={data.webhook.label}
						pro={isPro(data.plan)}
						isAdmin={isAdmin === true}
					/>
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
		icon: TicketIcon,
		name: "Jira",
		desc: "Create a ticket for each regression, linked to its pull request.",
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
									loading={revokeOthers.isPending}
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
				<ul className="mt-4 divide-y divide-border">
					{[0, 1].map((i) => (
						<li key={i} className="flex items-center gap-3 py-3">
							<Skeleton className="size-8" />
							<div className="flex-1 space-y-1.5">
								<Skeleton className="h-3.5 w-44" />
								<Skeleton className="h-3 w-28" />
							</div>
						</li>
					))}
				</ul>
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
	const [redirecting, setRedirecting] = useState<
		"checkout" | "checkout-yearly" | "portal" | null
	>(null);

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
	const founder = billing?.founder ?? null;

	const upgrade = async (period: "month" | "year") => {
		if (!org) return;
		setRedirecting(period === "year" ? "checkout-yearly" : "checkout");
		const { error } = await authClient.checkout({
			slug: period === "year" ? "pro-yearly" : "pro",
			reference_id: org.id,
			// The founding discount is for the monthly plan only.
			...(founder && period === "month"
				? { discount_id: founder.discountId }
				: {}),
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
					{!pro ? "$0" : sub?.interval === "year" ? "$290" : "$29"}
					<span className="text-muted-foreground text-sm">
						{pro && sub?.interval === "year" ? "/yr" : "/mo"}
					</span>
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
					{isPending ? (
						<Skeleton className="inline-block h-4 w-6 align-middle" />
					) : (
						repoCount
					)}
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
						loading={redirecting === "checkout" || justPaid}
						className="bg-brand text-brand-foreground hover:bg-brand/90"
						disabled={redirecting !== null || justPaid}
						onClick={() => upgrade("month")}
					>
						{redirecting === "checkout"
							? "Opening checkout…"
							: justPaid
								? "Activating Pro…"
								: founder
									? `Upgrade to Pro, $${founder.price}/month`
									: "Upgrade to Pro, $29/month"}
					</Button>
				)}
				{!pro && billing?.yearly && isAdmin && !justPaid && (
					<Button
						loading={redirecting === "checkout-yearly"}
						variant="outline"
						disabled={redirecting !== null}
						onClick={() => upgrade("year")}
					>
						{redirecting === "checkout-yearly"
							? "Opening checkout…"
							: "Yearly, $290 (2 months free)"}
					</Button>
				)}
				{pro && sub?.managedByYou && (
					<Button
						loading={redirecting === "portal"}
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
			{!pro && founder && isAdmin && (
				<p className="mt-3 text-sm">
					<span className="font-medium">Founding price:</span> ${founder.price}
					/month instead of $29, kept for as long as you stay subscribed.{" "}
					{founder.remaining} of {founder.total} founding spots left.
				</p>
			)}
			{!pro && billing?.configured && isAdmin && (
				<p className="mt-3 text-xs text-muted-foreground">
					Billed monthly through Polar, our payment provider, which handles
					taxes and invoices. Cancel any time from the billing portal. Not for
					you? Ask within 14 days of your first payment for a full refund.
				</p>
			)}
		</Card>
	);
}

/**
 * Self-service account deletion. Shows exactly what goes (workspaces where
 * you're the only owner) and what you just leave, then asks for the
 * account's email before deleting.
 */
function DeleteAccountCard() {
	const [open, setOpen] = useState(false);
	const [confirmEmail, setConfirmEmail] = useState("");
	const { data: preview, isPending } = useQuery({
		queryKey: ["account-deletion-preview"],
		queryFn: () => getAccountDeletionPreview(),
		enabled: open,
	});
	const remove = useMutation({
		mutationFn: deleteMyAccount,
		onSuccess: () => {
			// The session went with the account; start over from the homepage.
			window.location.href = "/";
		},
		onError: (err) =>
			toast.error(
				err instanceof Error ? err.message : "Could not delete your account",
			),
	});
	const matches =
		!!preview &&
		confirmEmail.trim().toLowerCase() === preview.email.toLowerCase();

	return (
		<Card className="p-6 max-w-xl border-destructive/30">
			<h2 className="font-semibold">Delete account</h2>
			<p className="mt-1 text-xs text-muted-foreground">
				Permanently deletes your Vitalgate account and signs you out everywhere.
				This can't be undone.
			</p>
			{!open ? (
				<Button
					className="mt-4"
					variant="destructive"
					size="sm"
					onClick={() => setOpen(true)}
				>
					Delete account…
				</Button>
			) : isPending || !preview ? (
				<div className="mt-4 space-y-2">
					<Skeleton className="h-3.5 w-full" />
					<Skeleton className="h-3.5 w-5/6" />
					<Skeleton className="h-3.5 w-2/3" />
				</div>
			) : (
				<form
					className="mt-4 space-y-4"
					onSubmit={(e) => {
						e.preventDefault();
						if (matches) remove.mutate({ data: { confirmEmail } });
					}}
				>
					<ul className="list-disc space-y-1.5 pl-5 text-sm">
						{preview.deletedWorkspaces.length > 0 && (
							<li>
								<span className="font-medium">
									{preview.deletedWorkspaces.join(", ")}
								</span>{" "}
								{preview.deletedWorkspaces.length === 1 ? "is" : "are"} deleted,
								since you're the only owner: repositories, budgets, pull request
								history and alerts. Vitalgate's workflow file is removed from
								those repositories.
							</li>
						)}
						{preview.leftWorkspaces.length > 0 && (
							<li>
								You leave{" "}
								<span className="font-medium">
									{preview.leftWorkspaces.join(", ")}
								</span>
								;{" "}
								{preview.leftWorkspaces.length === 1 ? "it stays" : "they stay"}{" "}
								as they are for the other members.
							</li>
						)}
						<li>
							Any Pro subscription you pay for, or that belongs to a deleted
							workspace, is canceled right away, without a refund for the rest
							of the month.
						</li>
						<li>
							To remove Vitalgate's access on GitHub too, uninstall the GitHub
							App from your GitHub settings.
						</li>
					</ul>
					<div className="space-y-1.5">
						<Label htmlFor="confirm-email" className="text-sm">
							Type <span className="font-mono">{preview.email}</span> to confirm
						</Label>
						<Input
							id="confirm-email"
							autoComplete="off"
							value={confirmEmail}
							onChange={(e) => setConfirmEmail(e.target.value)}
						/>
					</div>
					<div className="flex gap-2">
						<Button
							loading={remove.isPending}
							type="submit"
							variant="destructive"
							size="sm"
							disabled={!matches || remove.isPending}
						>
							{remove.isPending ? "Deleting…" : "Delete my account"}
						</Button>
						<Button
							type="button"
							variant="ghost"
							size="sm"
							disabled={remove.isPending}
							onClick={() => {
								setOpen(false);
								setConfirmEmail("");
							}}
						>
							Cancel
						</Button>
					</div>
				</form>
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
					<Reveal delay={0.05}>
						<DeleteAccountCard />
					</Reveal>
				</TabsContent>
			</Tabs>
		</AppShell>
	);
}
