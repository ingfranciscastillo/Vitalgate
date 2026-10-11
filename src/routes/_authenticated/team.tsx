import { PlusIcon, XIcon } from "@phosphor-icons/react";
import { createFileRoute } from "@tanstack/react-router";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import toast from "react-hot-toast";
import { AppShell } from "@/components/app-shell";
import { Reveal } from "@/components/reveal";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { authClient } from "@/lib/auth-client";
import { EASE_IN, staggerContainer, staggerItem } from "@/lib/motion";
import { useIsOrgAdmin } from "@/lib/org-roles";

export const Route = createFileRoute("/_authenticated/team")({
	head: () => ({ meta: [{ title: "Team: Vitalgate" }] }),
	component: Team,
});

// The only roles better-auth's organization plugin actually enforces here —
// no custom roles/permissions are configured (see auth.ts). Showing more
// than these would let someone pick a role the API rejects.
const INVITE_ROLES = ["member", "admin"] as const;

const roleStyles: Record<string, string> = {
	owner: "bg-primary/15 text-primary",
	admin: "bg-accent text-accent-foreground",
	member: "bg-muted text-foreground",
};

function initials(name: string) {
	return name
		.split(" ")
		.map((x) => x[0])
		.slice(0, 2)
		.join("")
		.toUpperCase();
}

function Team() {
	const { data: session } = authClient.useSession();
	const { data: org, isPending } = authClient.useActiveOrganization();
	const [email, setEmail] = useState("");
	const [role, setRole] = useState<(typeof INVITE_ROLES)[number]>("member");
	const [inviting, setInviting] = useState(false);
	const [busyId, setBusyId] = useState<string | null>(null);
	const [shakeInvite, setShakeInvite] = useState(false);
	const isAdmin = useIsOrgAdmin();
	const reduce = useReducedMotion();

	const members = org?.members ?? [];
	const pendingInvitations = (org?.invitations ?? []).filter(
		(i) => i.status === "pending",
	);

	const handleInvite = async () => {
		if (!email.trim()) {
			toast.error("Enter an email address");
			setShakeInvite(true);
			return;
		}
		setInviting(true);
		const { error } = await authClient.organization.inviteMember({
			email: email.trim(),
			role,
		});
		setInviting(false);
		if (error) {
			toast.error(error.message ?? "Could not send invite");
			return;
		}
		toast.success(`Invited ${email.trim()}`);
		setEmail("");
	};

	const handleRemove = async (memberId: string) => {
		setBusyId(memberId);
		const { error } = await authClient.organization.removeMember({
			memberIdOrEmail: memberId,
		});
		setBusyId(null);
		if (error) toast.error(error.message ?? "Could not remove member");
	};

	const handleCancelInvite = async (invitationId: string) => {
		setBusyId(invitationId);
		const { error } = await authClient.organization.cancelInvitation({
			invitationId,
		});
		setBusyId(null);
		if (error) toast.error(error.message ?? "Could not cancel invite");
	};

	return (
		<AppShell title="Team">
			<div className="grid lg:grid-cols-3 gap-4">
				<Reveal className="lg:col-span-2">
					<Card className="p-5">
						<div className="flex items-center justify-between mb-4">
							<h2 className="font-semibold">
								Members {isPending ? "" : `(${members.length})`}
							</h2>
						</div>
						{isPending ? (
							<ul className="divide-y divide-border">
								{[0, 1, 2].map((i) => (
									<li key={i} className="flex items-center gap-3 px-5 py-3">
										<Skeleton className="size-9 rounded-full" />
										<div className="flex-1 space-y-1.5">
											<Skeleton className="h-3.5 w-36" />
											<Skeleton className="h-3 w-52" />
										</div>
										<Skeleton className="h-6 w-20" />
									</li>
								))}
							</ul>
						) : (
							<motion.ul
								className="divide-y divide-border"
								variants={staggerContainer}
								initial="hidden"
								animate="show"
							>
								<AnimatePresence mode="popLayout">
									{members.map((m) => (
										<motion.li
											key={m.id}
											variants={staggerItem(reduce)}
											exit={{
												opacity: 0,
												height: 0,
												transition: { duration: 0.2, ease: EASE_IN },
											}}
											className="flex items-center gap-4 py-3 overflow-hidden"
										>
											{m.user.image ? (
												<img
													src={m.user.image}
													alt={m.user.name}
													width={36}
													height={36}
													loading="lazy"
													decoding="async"
													className="h-9 w-9 shrink-0 rounded-full object-cover"
												/>
											) : (
												<div className="h-9 w-9 shrink-0 rounded-full bg-linear-to-br from-primary/60 to-primary/20 grid place-items-center text-xs font-semibold text-primary-foreground">
													{initials(m.user.name || m.user.email)}
												</div>
											)}
											<div className="flex-1 min-w-0">
												<div className="text-sm font-medium">
													{m.user.name}
													{m.user.id === session?.user.id && (
														<span className="ml-1.5 text-xs text-muted-foreground">
															(you)
														</span>
													)}
												</div>
												<div className="text-xs text-muted-foreground font-mono">
													{m.user.email}
												</div>
											</div>
											<span
												className={`rounded-full px-2 py-0.5 text-[10px] font-medium capitalize ${roleStyles[m.role] ?? "bg-muted text-foreground"}`}
											>
												{m.role}
											</span>
											{isAdmin && m.role !== "owner" && (
												<Button
													type="button"
													size="icon-sm"
													variant="ghost"
													className="group"
													aria-label={`Remove ${m.user.name}`}
													disabled={busyId === m.id}
													onClick={() => handleRemove(m.id)}
												>
													<XIcon className="h-3.5 w-3.5 text-destructive transition-transform duration-150 ease-out group-hover:scale-110 group-active:scale-90" />
												</Button>
											)}
										</motion.li>
									))}
								</AnimatePresence>
							</motion.ul>
						)}

						{pendingInvitations.length > 0 && (
							<>
								<div className="text-xs uppercase tracking-wider text-muted-foreground mt-6 mb-2">
									Pending invitations
								</div>
								<motion.ul
									className="divide-y divide-border"
									variants={staggerContainer}
									initial="hidden"
									animate="show"
								>
									<AnimatePresence mode="popLayout">
										{pendingInvitations.map((inv) => (
											<motion.li
												key={inv.id}
												variants={staggerItem(reduce)}
												exit={{
													opacity: 0,
													height: 0,
													transition: { duration: 0.2, ease: EASE_IN },
												}}
												className="flex items-center gap-4 py-2.5 text-sm overflow-hidden"
											>
												<div className="flex-1 min-w-0 text-muted-foreground font-mono truncate">
													{inv.email}
												</div>
												<span
													className={`rounded-full px-2 py-0.5 text-[10px] font-medium capitalize ${roleStyles[inv.role] ?? "bg-muted text-foreground"}`}
												>
													{inv.role}
												</span>
												{isAdmin && (
													<Button
														type="button"
														size="icon-sm"
														variant="ghost"
														className="group"
														aria-label={`Cancel invitation to ${inv.email}`}
														disabled={busyId === inv.id}
														onClick={() => handleCancelInvite(inv.id)}
													>
														<XIcon className="h-3.5 w-3.5 text-destructive transition-transform duration-150 ease-out group-hover:scale-110 group-active:scale-90" />
													</Button>
												)}
											</motion.li>
										))}
									</AnimatePresence>
								</motion.ul>
							</>
						)}
					</Card>
				</Reveal>

				<Reveal delay={0.1}>
					<Card
						className={`p-5 ${shakeInvite ? "animate-shake" : ""}`}
						onAnimationEnd={() => setShakeInvite(false)}
					>
						<h2 className="font-semibold">Invite teammates</h2>
						<p className="text-xs text-muted-foreground mt-1">
							{isAdmin === false
								? "Only workspace owners and admins can invite teammates."
								: "Send an invite link by email."}
						</p>
						{isAdmin !== false && (
							<div className="mt-4 space-y-3">
								<Input
									type="email"
									placeholder="email@company.com"
									value={email}
									onChange={(e) => setEmail(e.target.value)}
								/>
								<select
									value={role}
									onChange={(e) =>
										setRole(e.target.value as (typeof INVITE_ROLES)[number])
									}
									className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm capitalize"
								>
									{INVITE_ROLES.map((r) => (
										<option key={r} value={r}>
											{r}
										</option>
									))}
								</select>
								<Button
									loading={inviting}
									className="w-full"
									disabled={inviting}
									onClick={handleInvite}
								>
									<PlusIcon className="h-4 w-4 mr-1.5" />
									{inviting ? "Sending…" : "Send invite"}
								</Button>
							</div>
						)}
						<div className="mt-6">
							<div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
								Roles
							</div>
							<ul className="text-xs space-y-1.5 text-muted-foreground">
								<li>
									<b className="text-foreground">Owner</b> · full control, can't
									be removed
								</li>
								<li>
									<b className="text-foreground">Admin</b> · manage members,
									repositories, tokens, integrations, and alert rules
								</li>
								<li>
									<b className="text-foreground">Member</b> · view dashboards,
									repositories, pull requests, and alerts
								</li>
							</ul>
						</div>
					</Card>
				</Reveal>
			</div>
		</AppShell>
	);
}
