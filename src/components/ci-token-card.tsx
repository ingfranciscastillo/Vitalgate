import { CopyIcon, TrashIcon } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useIsOrgAdmin } from "@/lib/org-roles";
import { createOrgToken, revokeOrgToken } from "@/lib/org-tokens.functions";
import { orgTokensQueryOptions } from "@/lib/org-tokens.queries";

export function CiTokenCard() {
	const queryClient = useQueryClient();
	const { data: tokens, isPending } = useQuery(orgTokensQueryOptions());
	const [justCreated, setJustCreated] = useState<string | null>(null);
	const isAdmin = useIsOrgAdmin();

	const createMutation = useMutation({
		mutationFn: createOrgToken,
		onSuccess: ({ token }) => {
			setJustCreated(token);
			queryClient.invalidateQueries({ queryKey: ["org-tokens"] });
		},
		onError: () => toast.error("Could not create token"),
	});

	const revokeMutation = useMutation({
		mutationFn: revokeOrgToken,
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["org-tokens"] });
		},
		onError: () => toast.error("Could not revoke token"),
	});

	return (
		<Card className="p-6 max-w-xl">
			<h2 className="font-semibold">CI token</h2>
			<p className="mt-1 text-sm text-muted-foreground">
				Used by the Vitalgate GitHub Action to report Lighthouse results. Add it
				as a repo secret named{" "}
				<code className="font-mono text-xs">VITALGATE_TOKEN</code>.
			</p>

			{justCreated && (
				<div className="mt-4 rounded-md border border-primary/30 bg-primary/5 p-3">
					<div className="text-xs text-muted-foreground">
						Copy it now, it won't be shown again.
					</div>
					<div className="mt-1.5 flex items-center gap-2">
						<code className="flex-1 truncate rounded bg-muted px-2 py-1 font-mono text-xs">
							{justCreated}
						</code>
						<Button
							type="button"
							size="icon-sm"
							variant="outline"
							onClick={() => {
								navigator.clipboard.writeText(justCreated);
								toast.success("Copied");
							}}
						>
							<CopyIcon className="size-3.5" />
						</Button>
					</div>
				</div>
			)}

			<div className="mt-4 space-y-2">
				{isPending && <p className="text-sm text-muted-foreground">Loading…</p>}
				{tokens?.length === 0 && !isPending && (
					<p className="text-sm text-muted-foreground">
						No tokens yet. Generate one to wire up CI.
					</p>
				)}
				{tokens?.map((t) => (
					<div
						key={t.id}
						className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm"
					>
						<div>
							<span className="font-mono">vgate_…{t.lastFour}</span>
							<span className="ml-2 text-xs text-muted-foreground">
								created {new Date(t.createdAt).toLocaleDateString()}
								{t.lastUsedAt
									? `, last used ${new Date(t.lastUsedAt).toLocaleDateString()}`
									: ", never used"}
							</span>
						</div>
						{isAdmin && (
							<Button
								type="button"
								size="icon-sm"
								variant="ghost"
								onClick={() => revokeMutation.mutate({ data: t.id })}
								aria-label="Revoke token"
							>
								<TrashIcon className="size-3.5 text-destructive" />
							</Button>
						)}
					</div>
				))}
			</div>

			{isAdmin === false ? (
				<p className="mt-4 text-xs text-muted-foreground">
					Only workspace owners and admins can generate or revoke tokens.
				</p>
			) : (
				<Button
					className="mt-4"
					variant="outline"
					onClick={() => createMutation.mutate({})}
					disabled={createMutation.isPending || !isAdmin}
				>
					Generate new token
				</Button>
			)}
		</Card>
	);
}
