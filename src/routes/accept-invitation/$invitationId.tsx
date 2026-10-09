import { CircleNotchIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
	createFileRoute,
	Link,
	redirect,
	useNavigate,
	useRouter,
} from "@tanstack/react-router";
import { useState } from "react";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getSession } from "@/lib/auth.functions";
import { authClient } from "@/lib/auth-client";
import { NOINDEX_META } from "@/lib/seo";

export const Route = createFileRoute("/accept-invitation/$invitationId")({
	// Invitation emails link here directly, so a signed-out visitor goes
	// through GitHub sign-in and comes straight back (login's ?redirect=).
	beforeLoad: async ({ location }) => {
		const session = await getSession();
		if (!session) {
			throw redirect({ to: "/login", search: { redirect: location.href } });
		}
		return { session };
	},
	head: () => ({
		meta: [{ title: "Join workspace: Vitalgate" }, ...NOINDEX_META],
	}),
	component: AcceptInvitation,
});

function AcceptInvitation() {
	const { invitationId } = Route.useParams();
	const { session } = Route.useRouteContext();
	const navigate = useNavigate();
	const router = useRouter();
	const queryClient = useQueryClient();
	const [busy, setBusy] = useState<"accept" | "reject" | null>(null);
	const [actionError, setActionError] = useState<string | null>(null);

	const invitation = useQuery({
		queryKey: ["invitation", invitationId],
		queryFn: async () => {
			const { data, error } = await authClient.organization.getInvitation({
				query: { id: invitationId },
			});
			if (error) throw new Error(error.message ?? "Invitation not found");
			return data;
		},
		retry: false,
	});

	const accept = async () => {
		setBusy("accept");
		setActionError(null);
		const { data, error } = await authClient.organization.acceptInvitation({
			invitationId,
		});
		if (error || !data) {
			setActionError(error?.message ?? "Could not accept the invitation");
			setBusy(null);
			return;
		}
		// Accepting already makes it the session's active organization; the
		// explicit setActive just keeps the client's org store in sync.
		await authClient.organization.setActive({
			organizationId: data.invitation.organizationId,
		});
		await queryClient.invalidateQueries();
		await router.invalidate();
		navigate({ to: "/dashboard" });
	};

	const reject = async () => {
		setBusy("reject");
		setActionError(null);
		const { error } = await authClient.organization.rejectInvitation({
			invitationId,
		});
		if (error) {
			setActionError(error.message ?? "Could not decline the invitation");
			setBusy(null);
			return;
		}
		navigate({ to: "/dashboard" });
	};

	return (
		<div className="grid min-h-screen place-items-center bg-background px-5 text-foreground">
			<div className="w-full max-w-md">
				<Link to="/" className="mb-8 inline-block">
					<Logo />
				</Link>
				<Card className="p-6">
					{invitation.isPending ? (
						<p className="flex items-center gap-2 text-sm text-muted-foreground">
							<CircleNotchIcon className="h-4 w-4 animate-spin" />
							Loading invitation…
						</p>
					) : invitation.isError ? (
						<InvitationProblem
							message={invitation.error.message}
							email={session.user.email}
						/>
					) : invitation.data.status !== "pending" ? (
						<InvitationProblem
							message={`This invitation has already been ${invitation.data.status}.`}
							email={session.user.email}
						/>
					) : (
						<>
							<h1 className="text-xl font-bold tracking-tight">
								Join {invitation.data.organizationName}
							</h1>
							<p className="mt-2 text-sm text-muted-foreground">
								{invitation.data.inviterEmail} invited you to this Vitalgate
								workspace as{" "}
								<span className="font-medium text-foreground">
									{invitation.data.role}
								</span>
								.
							</p>
							{actionError && (
								<p className="mt-4 flex items-start gap-1.5 text-xs text-destructive">
									<WarningCircleIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
									{actionError}
								</p>
							)}
							<div className="mt-6 flex gap-3">
								<Button onClick={accept} disabled={busy !== null}>
									{busy === "accept" ? "Joining…" : "Accept invitation"}
								</Button>
								<Button
									variant="ghost"
									onClick={reject}
									disabled={busy !== null}
								>
									{busy === "reject" ? "Declining…" : "Decline"}
								</Button>
							</div>
						</>
					)}
				</Card>
			</div>
		</div>
	);
}

function InvitationProblem({
	message,
	email,
}: {
	message: string;
	email: string;
}) {
	return (
		<>
			<h1 className="text-xl font-bold tracking-tight">
				Can't open this invitation
			</h1>
			<p className="mt-2 text-sm text-muted-foreground">{message}</p>
			<p className="mt-3 text-sm text-muted-foreground">
				You're signed in as <span className="font-mono">{email}</span>.
				Invitations can only be accepted from the account whose email they were
				sent to, and expire after 48 hours. Ask the workspace admin to send a
				new one if needed.
			</p>
			<Link to="/dashboard" className="mt-6 inline-block">
				<Button variant="outline">Go to dashboard</Button>
			</Link>
		</>
	);
}
