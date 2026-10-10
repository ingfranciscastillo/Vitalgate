import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { Dialog } from "radix-ui";
import { useState } from "react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";

function slugify(name: string): string {
	const base = name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/(^-|-$)/g, "")
		.slice(0, 40);
	// Slugs are globally unique; a short random suffix avoids collisions
	// between workspaces that happen to share a name.
	return `${base || "workspace"}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Creates a new workspace and switches to it. Only offered to owners/admins
 * of a Pro workspace; better-auth's allowUserToCreateOrganization (auth.ts)
 * enforces the same rule on the server.
 */
export function CreateWorkspaceDialog({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const [name, setName] = useState("");
	const [creating, setCreating] = useState(false);
	const queryClient = useQueryClient();
	const router = useRouter();

	const create = async (e: React.FormEvent) => {
		e.preventDefault();
		const trimmed = name.trim();
		if (!trimmed) return;
		setCreating(true);
		const { data, error } = await authClient.organization.create({
			name: trimmed,
			slug: slugify(trimmed),
		});
		if (error || !data) {
			toast.error(error?.message ?? "Could not create the workspace");
			setCreating(false);
			return;
		}
		await authClient.organization.setActive({ organizationId: data.id });
		await queryClient.invalidateQueries();
		await router.invalidate();
		toast.success(`Created ${trimmed}`);
		setCreating(false);
		setName("");
		onOpenChange(false);
	};

	return (
		<Dialog.Root open={open} onOpenChange={onOpenChange}>
			<Dialog.Portal>
				<Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
				<Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 border border-border bg-background p-6 shadow-lg data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95">
					<Dialog.Title className="font-semibold">
						Create a workspace
					</Dialog.Title>
					<Dialog.Description className="mt-1 text-sm text-muted-foreground">
						A separate space with its own repositories, team and plan. New
						workspaces start on the Free plan.
					</Dialog.Description>
					<form onSubmit={create} className="mt-5 space-y-4">
						<div className="space-y-1.5">
							<Label htmlFor="workspace-name">Name</Label>
							<Input
								id="workspace-name"
								value={name}
								onChange={(e) => setName(e.target.value)}
								placeholder="Acme"
								maxLength={60}
								autoFocus
								required
							/>
						</div>
						<div className="flex justify-end gap-2">
							<Dialog.Close asChild>
								<Button type="button" variant="ghost">
									Cancel
								</Button>
							</Dialog.Close>
							<Button type="submit" disabled={creating || !name.trim()}>
								{creating ? "Creating…" : "Create workspace"}
							</Button>
						</div>
					</form>
				</Dialog.Content>
			</Dialog.Portal>
		</Dialog.Root>
	);
}
