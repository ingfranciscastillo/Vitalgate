import { BellIcon } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { Popover } from "radix-ui";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { markAlertsRead, type OrgAlertItem } from "@/lib/alerts.functions";
import { orgAlertsQueryOptions } from "@/lib/alerts.queries";
import { timeAgo } from "@/lib/format";

export function NotificationBell() {
	// Same query the /alerts and dashboard pages already use — likely warm
	// from cache already if either was visited this session.
	const alertsQuery = orgAlertsQueryOptions();
	const { data: alerts } = useQuery(alertsQuery);
	const queryClient = useQueryClient();
	const navigate = useNavigate();
	const [open, setOpen] = useState(false);

	const unread = (alerts ?? []).filter((a) => !a.read && a.level !== "info");
	const recent = (alerts ?? []).slice(0, 5);

	// Marks read in the cache right away, so the badge drops on click rather
	// than after the round trip; the server call then makes it stick.
	const markRead = useMutation({
		mutationFn: markAlertsRead,
		onMutate: ({ data }) => {
			const ids = data.alertIds ? new Set(data.alertIds) : null;
			queryClient.setQueryData(alertsQuery.queryKey, (old) =>
				old?.map((a) => (!ids || ids.has(a.id) ? { ...a, read: true } : a)),
			);
		},
		onSettled: () =>
			queryClient.invalidateQueries({ queryKey: alertsQuery.queryKey }),
	});

	const openAlert = (alert: OrgAlertItem) => {
		if (!alert.read) markRead.mutate({ data: { alertIds: [alert.id] } });
		setOpen(false);
		navigate({
			to: "/repositories/$repoId",
			params: { repoId: alert.repoId },
		});
	};

	return (
		<Popover.Root open={open} onOpenChange={setOpen}>
			<Popover.Trigger asChild>
				<Button
					variant="ghost"
					size="icon"
					aria-label={
						unread.length > 0
							? `Notifications, ${unread.length} unread`
							: "Notifications"
					}
					className="group relative"
				>
					<BellIcon className="size-4 transition-transform duration-150 ease-out group-hover:animate-bell-ring" />
					{unread.length > 0 && (
						<span className="absolute right-1 top-1 grid h-4 min-w-4 animate-badge-in place-items-center rounded-full bg-destructive px-1 text-[9px] font-semibold text-destructive-foreground">
							{unread.length > 9 ? "9+" : unread.length}
						</span>
					)}
				</Button>
			</Popover.Trigger>
			<Popover.Portal>
				<Popover.Content
					align="end"
					sideOffset={8}
					className="z-50 w-80 origin-(--radix-popover-content-transform-origin) border border-border bg-popover text-popover-foreground shadow-md outline-none data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=closed]:duration-150 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=open]:duration-250"
				>
					<div className="flex items-center justify-between border-b border-border px-4 py-3">
						<h2 className="text-sm font-semibold">Notifications</h2>
						{unread.length > 0 && (
							<button
								type="button"
								onClick={() => markRead.mutate({ data: {} })}
								className="text-xs text-primary hover:underline"
							>
								Mark all as read
							</button>
						)}
					</div>
					{recent.length === 0 ? (
						<p className="px-4 py-8 text-center text-sm text-muted-foreground">
							No alerts yet.
						</p>
					) : (
						<ul className="max-h-80 divide-y divide-border overflow-y-auto">
							{recent.map((a) => (
								<li key={a.id}>
									<button
										type="button"
										onClick={() => openAlert(a)}
										className={`flex w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/60 ${a.read ? "opacity-60" : ""}`}
									>
										<span
											className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${a.read ? "bg-transparent" : a.level === "critical" ? "bg-destructive" : a.level === "warning" ? "bg-warning" : "bg-muted-foreground"}`}
										/>
										<span className="min-w-0">
											<span
												className={`block truncate text-sm ${a.read ? "" : "font-semibold"}`}
											>
												{a.title}
												{!a.read && <span className="sr-only"> (unread)</span>}
											</span>
											<span className="block truncate text-xs text-muted-foreground">
												{a.message}
											</span>
											<span className="mt-0.5 block font-mono text-[10px] text-muted-foreground">
												{a.repoFullName} · {timeAgo(a.createdAt)}
											</span>
										</span>
									</button>
								</li>
							))}
						</ul>
					)}
					<Popover.Close asChild>
						<Link
							to="/alerts"
							className="block border-t border-border px-4 py-2.5 text-center text-xs text-primary hover:underline"
						>
							View all alerts
						</Link>
					</Popover.Close>
				</Popover.Content>
			</Popover.Portal>
		</Popover.Root>
	);
}
