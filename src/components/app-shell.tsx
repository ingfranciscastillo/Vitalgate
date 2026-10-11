import {
	BellIcon,
	CaretDownIcon,
	ChartBarIcon,
	CheckIcon,
	FolderSimpleIcon,
	GearIcon,
	GitPullRequestIcon,
	ListIcon,
	PlusIcon,
	SignOutIcon,
	SquaresFourIcon,
	UsersIcon,
	XIcon,
} from "@phosphor-icons/react";
import { useQueryClient } from "@tanstack/react-query";
import {
	Link,
	useNavigate,
	useRouter,
	useRouterState,
} from "@tanstack/react-router";
import { Dialog, DropdownMenu } from "radix-ui";
import { type ComponentType, type ReactNode, useState } from "react";
import toast from "react-hot-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { authClient } from "@/lib/auth-client";
import { isPro } from "@/lib/plan";
import { CreateWorkspaceDialog } from "./create-workspace-dialog";
import { HeaderSearch } from "./header-search";
import { Logo } from "./logo";
import { NotificationBell } from "./notification-bell";
import { ThemeToggle } from "./theme-toggle";

const nav: {
	to: string;
	label: string;
	icon: ComponentType<{ className?: string; weight?: "regular" | "fill" }>;
}[] = [
	{ to: "/dashboard", label: "Dashboard", icon: SquaresFourIcon },
	{ to: "/repositories", label: "Repositories", icon: FolderSimpleIcon },
	{ to: "/pulls", label: "Pull Requests", icon: GitPullRequestIcon },
	{ to: "/alerts", label: "Alerts", icon: BellIcon },
	{ to: "/team", label: "Team", icon: UsersIcon },
	{ to: "/settings", label: "Settings", icon: GearIcon },
];

function NavList({
	pathname,
	onNavigate,
}: {
	pathname: string;
	onNavigate?: () => void;
}) {
	return (
		<nav className="flex-1 space-y-0.5 px-2">
			{nav.map((item) => {
				const active =
					pathname === item.to || pathname.startsWith(`${item.to}/`);
				const Icon = item.icon;
				return (
					<Link
						key={item.to}
						to={item.to}
						onClick={onNavigate}
						className={`relative flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
							active
								? "bg-sidebar-accent font-medium text-foreground"
								: "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground"
						}`}
					>
						{active && (
							<span
								className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-primary"
								aria-hidden
							/>
						)}
						<Icon className="size-4" weight={active ? "fill" : "regular"} />
						{item.label}
					</Link>
				);
			})}
		</nav>
	);
}

/**
 * Lists every workspace the user belongs to (their own, plus any joined via
 * an invitation) and switches the session's active one. Every server query
 * reads activeOrganizationId off the session, so after switching, all cached
 * queries and route loaders are refetched.
 */
function WorkspaceSwitcher() {
	const { data: activeOrg, isPending } = authClient.useActiveOrganization();
	const { data: orgs } = authClient.useListOrganizations();
	const queryClient = useQueryClient();
	const router = useRouter();
	const [switching, setSwitching] = useState(false);
	const [creating, setCreating] = useState(false);
	const navigate = useNavigate();
	// Mirrors the server rule (allowUserToCreateOrganization in auth.ts),
	// which also requires being an owner/admin of that Pro workspace.
	const canCreate = (orgs ?? []).some((o) => isPro(o.plan));
	const name = isPending ? "" : (activeOrg?.name ?? "No workspace");
	const initial = name ? name.charAt(0).toUpperCase() : "?";

	const switchTo = async (organizationId: string) => {
		if (organizationId === activeOrg?.id) return;
		setSwitching(true);
		const { error } = await authClient.organization.setActive({
			organizationId,
		});
		if (error) {
			toast.error(error.message ?? "Could not switch workspace");
		} else {
			await queryClient.invalidateQueries();
			await router.invalidate();
		}
		setSwitching(false);
	};

	return (
		<DropdownMenu.Root>
			<DropdownMenu.Trigger asChild>
				<button
					type="button"
					disabled={switching}
					className="flex w-full items-center gap-2 rounded-md border border-border bg-background/60 px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
				>
					<span className="grid size-5 shrink-0 place-items-center rounded-sm bg-primary/15 text-[10px] font-semibold text-primary">
						{initial}
					</span>
					<span className="truncate">
						{isPending ? (
							<Skeleton className="h-3.5 w-24" />
						) : switching ? (
							"Switching…"
						) : (
							name
						)}
					</span>
					<CaretDownIcon className="ml-auto size-3.5 shrink-0" weight="bold" />
				</button>
			</DropdownMenu.Trigger>
			<DropdownMenu.Portal>
				<DropdownMenu.Content
					align="start"
					sideOffset={4}
					className="z-50 min-w-(--radix-dropdown-menu-trigger-width) rounded-md border border-border bg-popover p-1 text-xs text-popover-foreground shadow-md origin-(--radix-dropdown-menu-content-transform-origin) outline-none data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=closed]:duration-150 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=open]:duration-250 motion-reduce:animate-none"
				>
					<DropdownMenu.Label className="px-2 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
						Workspaces
					</DropdownMenu.Label>
					{(orgs ?? []).map((org) => (
						<DropdownMenu.Item
							key={org.id}
							onSelect={() => switchTo(org.id)}
							className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 outline-none data-highlighted:bg-accent data-highlighted:text-accent-foreground"
						>
							<span className="grid size-5 shrink-0 place-items-center rounded-sm bg-primary/15 text-[10px] font-semibold text-primary">
								{org.name.charAt(0).toUpperCase()}
							</span>
							<span className="truncate">{org.name}</span>
							{org.id === activeOrg?.id && (
								<CheckIcon
									className="ml-auto size-3.5 shrink-0"
									weight="bold"
								/>
							)}
						</DropdownMenu.Item>
					))}
					<DropdownMenu.Separator className="my-1 h-px bg-border" />
					<DropdownMenu.Item
						onSelect={() =>
							canCreate ? setCreating(true) : navigate({ to: "/pricing" })
						}
						className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 outline-none data-highlighted:bg-accent data-highlighted:text-accent-foreground"
					>
						<PlusIcon className="size-3.5 shrink-0" weight="bold" />
						<span>Create workspace</span>
						{!canCreate && (
							<span className="ml-auto rounded-full bg-brand/15 px-1.5 py-0.5 text-[10px] font-medium text-brand">
								Pro
							</span>
						)}
					</DropdownMenu.Item>
				</DropdownMenu.Content>
			</DropdownMenu.Portal>
			<CreateWorkspaceDialog open={creating} onOpenChange={setCreating} />
		</DropdownMenu.Root>
	);
}

function SidebarContent({
	pathname,
	onNavigate,
}: {
	pathname: string;
	onNavigate?: () => void;
}) {
	const navigate = useNavigate();

	return (
		<>
			<div className="px-3 py-3">
				<WorkspaceSwitcher />
			</div>
			<NavList pathname={pathname} onNavigate={onNavigate} />
			<div className="border-t border-border p-3">
				<button
					type="button"
					onClick={() => {
						signOut(navigate);
					}}
					className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-sidebar-accent/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				>
					<SignOutIcon className="size-4" />
					Sign out
				</button>
			</div>
		</>
	);
}

function signOut(navigate: ReturnType<typeof useNavigate>) {
	void authClient.signOut().then(() => navigate({ to: "/login" }));
}

/** The avatar in the header: who's signed in, plus Settings and Sign out. */
function UserMenu() {
	const { data: session } = authClient.useSession();
	const navigate = useNavigate();
	const user = session?.user;
	const initial = user?.name?.charAt(0).toUpperCase() ?? "U";

	return (
		<DropdownMenu.Root>
			<DropdownMenu.Trigger asChild>
				<button
					type="button"
					aria-label="Account menu"
					className="rounded-full transition-shadow duration-150 hover:ring-2 hover:ring-border data-[state=open]:ring-2 data-[state=open]:ring-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
				>
					{user?.image ? (
						<img
							src={user.image}
							alt=""
							width={32}
							height={32}
							decoding="async"
							className="size-8 shrink-0 rounded-full object-cover"
						/>
					) : (
						<span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
							{initial}
						</span>
					)}
				</button>
			</DropdownMenu.Trigger>
			<DropdownMenu.Portal>
				<DropdownMenu.Content
					align="end"
					sideOffset={8}
					className="z-50 w-60 rounded-md border border-border bg-popover p-1 text-sm text-popover-foreground shadow-md origin-(--radix-dropdown-menu-content-transform-origin) outline-none data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=closed]:duration-150 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=open]:duration-250 motion-reduce:animate-none"
				>
					{user && (
						<div className="px-2 py-2">
							<div className="truncate font-medium">{user.name}</div>
							<div className="truncate text-xs text-muted-foreground">
								{user.email}
							</div>
						</div>
					)}
					<DropdownMenu.Separator className="my-1 h-px bg-border" />
					<DropdownMenu.Item
						onSelect={() => navigate({ to: "/settings" })}
						className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 outline-none data-highlighted:bg-accent data-highlighted:text-accent-foreground"
					>
						<GearIcon className="size-4" />
						Settings
					</DropdownMenu.Item>
					<DropdownMenu.Item
						onSelect={() => signOut(navigate)}
						className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 outline-none data-highlighted:bg-accent data-highlighted:text-accent-foreground"
					>
						<SignOutIcon className="size-4" />
						Sign out
					</DropdownMenu.Item>
				</DropdownMenu.Content>
			</DropdownMenu.Portal>
		</DropdownMenu.Root>
	);
}

export function AppShell({
	children,
	title,
}: {
	children: ReactNode;
	title?: string;
}) {
	const pathname = useRouterState({ select: (s) => s.location.pathname });
	const [mobileNavOpen, setMobileNavOpen] = useState(false);

	// Each page's title icon matches its own sidebar entry instead of a single
	// icon reused everywhere — falls back to ChartBarIcon for a title-bearing
	// page with no matching nav item (none today, but detail pages don't pass
	// title at all so this only ever applies to the six nav routes above).
	const TitleIcon =
		nav.find(
			(item) => pathname === item.to || pathname.startsWith(`${item.to}/`),
		)?.icon ?? ChartBarIcon;

	return (
		<div className="flex min-h-dvh w-full bg-background text-foreground">
			{/* Pinned to the viewport, so Sign out stays at the bottom of the
			    screen however long the page is. */}
			<aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-sidebar lg:sticky lg:top-0 lg:flex lg:h-dvh">
				<div className="flex h-14 items-center border-b border-border px-5">
					<Link to="/dashboard">
						<Logo />
					</Link>
				</div>
				<SidebarContent pathname={pathname} />
			</aside>

			<Dialog.Root open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
				<Dialog.Portal>
					<Dialog.Overlay className="fixed inset-0 z-40 bg-black/40 duration-200 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:duration-150 data-[state=open]:animate-in data-[state=open]:fade-in-0 lg:hidden" />
					<Dialog.Content
						className="fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-border bg-sidebar outline-none duration-300 ease-out data-[state=closed]:animate-out data-[state=closed]:duration-200 data-[state=closed]:ease-in data-[state=closed]:slide-out-to-left data-[state=open]:animate-in data-[state=open]:slide-in-from-left lg:hidden"
						aria-describedby={undefined}
					>
						<Dialog.Title className="sr-only">Navigation menu</Dialog.Title>
						<div className="flex h-14 items-center justify-between border-b border-border px-5">
							<Link to="/dashboard" onClick={() => setMobileNavOpen(false)}>
								<Logo />
							</Link>
							<Dialog.Close asChild>
								<button
									type="button"
									aria-label="Close menu"
									className="group rounded-md p-1.5 text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
								>
									<XIcon className="size-4 transition-transform duration-150 ease-out group-hover:scale-110 group-active:scale-90" />
								</button>
							</Dialog.Close>
						</div>
						<SidebarContent
							pathname={pathname}
							onNavigate={() => setMobileNavOpen(false)}
						/>
					</Dialog.Content>
				</Dialog.Portal>
			</Dialog.Root>

			<div className="flex min-w-0 flex-1 flex-col">
				<header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur lg:px-6">
					<button
						type="button"
						aria-label="Open menu"
						onClick={() => setMobileNavOpen(true)}
						className="group -ml-1.5 rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:hidden"
					>
						<ListIcon className="size-5 transition-transform duration-150 ease-out group-hover:scale-110 group-active:scale-90" />
					</button>
					<div className="lg:hidden">
						<Logo />
					</div>

					<HeaderSearch />

					<div className="ml-auto flex items-center gap-2">
						<NotificationBell />
						<ThemeToggle />
						<UserMenu />
					</div>
				</header>

				{title && (
					<div className="flex items-center gap-3 px-4 pb-2 pt-6 lg:px-8">
						<TitleIcon className="size-4 text-muted-foreground" />
						<h1 className="text-xl font-semibold tracking-tight">{title}</h1>
					</div>
				)}

				<main className="flex-1 px-4 py-6 lg:px-8">{children}</main>
			</div>
		</div>
	);
}
