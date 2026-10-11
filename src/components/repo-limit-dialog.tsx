import { XIcon } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import { Dialog } from "radix-ui";
import { Button } from "@/components/ui/button";
import { FREE_REPO_LIMIT } from "@/lib/plan";

/**
 * The Free-plan repo cap paywall — same trigger, same copy, wherever a user
 * hits it (the repositories list's "Connect repo" button, or trying to
 * select one more repo than the plan allows on the connect page).
 */
export function RepoLimitDialog({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	return (
		<Dialog.Root open={open} onOpenChange={onOpenChange}>
			<Dialog.Portal>
				<Dialog.Overlay className="fixed inset-0 z-40 bg-black/40 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:duration-150 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
				<Dialog.Content className="fixed top-1/2 left-1/2 z-50 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-md border border-border bg-card p-6 shadow-lg outline-none duration-200 ease-out data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=closed]:duration-150 data-[state=closed]:ease-in data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95">
					<div className="flex items-start justify-between gap-3">
						<Dialog.Title className="font-semibold">
							You've reached the Free plan limit
						</Dialog.Title>
						<Dialog.Close className="group shrink-0 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
							<XIcon className="size-4 transition-transform duration-150 ease-out group-hover:scale-110 group-active:scale-90" />
						</Dialog.Close>
					</div>
					<Dialog.Description className="mt-2 text-sm text-muted-foreground">
						Free includes {FREE_REPO_LIMIT} connected repository. Upgrade to Pro
						for unlimited repositories, Slack, Discord and webhook alerts, and custom alert
						rules.
					</Dialog.Description>

					<div className="mt-5 space-y-2">
						<div className="flex items-center justify-between rounded-md bg-muted/50 px-3 py-2.5 text-sm">
							<span className="text-muted-foreground">Free</span>
							<span className="font-mono">
								{FREE_REPO_LIMIT} repo{FREE_REPO_LIMIT === 1 ? "" : "s"}
							</span>
						</div>
						<div className="flex items-center justify-between rounded-md border border-brand/30 bg-brand/5 px-3 py-2.5 text-sm">
							<span className="font-medium text-brand">Pro — $29/mo</span>
							<span className="font-mono">Unlimited</span>
						</div>
					</div>

					<div className="mt-6 flex gap-2">
						<Dialog.Close asChild>
							<Button variant="ghost" className="flex-1">
								Maybe later
							</Button>
						</Dialog.Close>
						<Link to="/settings" search={{ tab: "billing" }} className="flex-1">
							<Button className="w-full bg-brand text-brand-foreground hover:bg-brand/90">
								Upgrade to Pro
							</Button>
						</Link>
					</div>
				</Dialog.Content>
			</Dialog.Portal>
		</Dialog.Root>
	);
}
