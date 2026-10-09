import {
	DiscordLogoIcon,
	EnvelopeSimpleIcon,
	SlackLogoIcon,
} from "@phosphor-icons/react";
import {
	useMutation,
	useQueryClient,
	useSuspenseQuery,
} from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import toast from "react-hot-toast";
import { AppShell } from "@/components/app-shell";
import { Reveal } from "@/components/reveal";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { setAlertRuleEnabled } from "@/lib/alert-rules.functions";
import { alertRulesQueryOptions } from "@/lib/alert-rules.queries";
import { orgAlertsQueryOptions } from "@/lib/alerts.queries";
import { authClient } from "@/lib/auth-client";
import { timeAgo } from "@/lib/format";
import { EASE_IN, staggerContainer, staggerItem } from "@/lib/motion";
import { useIsOrgAdmin } from "@/lib/org-roles";
import { isPro, PRO_ONLY_ALERT_RULES } from "@/lib/plan";

const channelIcon = {
	slack: SlackLogoIcon,
	discord: DiscordLogoIcon,
	email: EnvelopeSimpleIcon,
} as const;

export const Route = createFileRoute("/_authenticated/alerts")({
	loader: ({ context }) =>
		Promise.all([
			context.queryClient.ensureQueryData(orgAlertsQueryOptions()),
			context.queryClient.ensureQueryData(alertRulesQueryOptions()),
		]),
	head: () => ({ meta: [{ title: "Alerts: Vitalgate" }] }),
	component: Alerts,
});

function Alerts() {
	const { data: alerts } = useSuspenseQuery(orgAlertsQueryOptions());
	const { data: rules } = useSuspenseQuery(alertRulesQueryOptions());
	const { data: org } = authClient.useActiveOrganization();
	const queryClient = useQueryClient();
	const reduce = useReducedMotion();
	const pro = isPro(org?.plan);
	const isAdmin = useIsOrgAdmin();

	const toggleRule = useMutation({
		mutationFn: setAlertRuleEnabled,
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["alert-rules"] });
		},
		onError: () => toast.error("Could not update the rule"),
	});

	return (
		<AppShell title="Alerts">
			<div className="grid lg:grid-cols-3 gap-4">
				<Reveal className="lg:col-span-2">
					<Card className="p-5">
						<h2 className="font-semibold">Recent activity</h2>
						{alerts.length === 0 ? (
							<p className="mt-4 text-sm text-muted-foreground text-center py-6">
								No alerts yet. A required budget violation on a PR shows up
								here.
							</p>
						) : (
							<motion.ul
								className="mt-4 divide-y divide-border"
								variants={staggerContainer}
								initial="hidden"
								animate="show"
							>
								<AnimatePresence mode="popLayout">
									{alerts.map((a) => {
										const Icon = channelIcon[a.channel];
										return (
											<motion.li
												key={a.id}
												variants={staggerItem(reduce)}
												exit={{
													opacity: 0,
													height: 0,
													transition: { duration: 0.2, ease: EASE_IN },
												}}
												className="flex gap-4 py-4 overflow-hidden"
											>
												<div
													className={`h-8 w-8 rounded-md grid place-items-center shrink-0 ${a.level === "critical" ? "bg-destructive/15 text-destructive animate-status-pulse" : a.level === "warning" ? "bg-warning/20 text-warning-foreground" : "bg-muted text-muted-foreground"}`}
												>
													<Icon className="h-4 w-4" />
												</div>
												<div className="flex-1 min-w-0">
													<div className="flex items-center gap-2">
														<span className="font-medium text-sm">
															{a.title}
														</span>
														<span
															className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${a.level === "critical" ? "bg-destructive/15 text-destructive" : a.level === "warning" ? "bg-warning/20 text-warning-foreground" : "bg-muted text-muted-foreground"}`}
														>
															{a.level}
														</span>
													</div>
													<p className="text-sm text-muted-foreground mt-0.5">
														{a.message}
													</p>
													<div className="mt-1 font-mono text-[10px] text-muted-foreground">
														{a.repoFullName} · {a.channel} ·{" "}
														{timeAgo(a.createdAt)}
													</div>
												</div>
											</motion.li>
										);
									})}
								</AnimatePresence>
							</motion.ul>
						)}
					</Card>
				</Reveal>

				<Reveal delay={0.1}>
					<Card className="p-5">
						<h2 className="font-semibold">Alert rules</h2>
						<p className="mt-1 text-xs text-muted-foreground">
							Budget violation is on every plan. Regression detection, score
							thresholds, and the weekly digest are Pro features.
							{isAdmin === false &&
								" Only workspace owners and admins can change them."}
						</p>
						<motion.ul
							className="mt-4 space-y-4"
							variants={staggerContainer}
							initial="hidden"
							animate="show"
						>
							{rules.map((r) => {
								const locked = !pro && PRO_ONLY_ALERT_RULES.includes(r.key);
								return (
									<motion.li
										key={r.key}
										variants={staggerItem(reduce)}
										className="flex items-start justify-between gap-4"
									>
										<div>
											<div className="flex items-center gap-2">
												<span className="text-sm font-medium">{r.label}</span>
												{locked && (
													<span className="rounded-full bg-brand/15 text-brand px-2 py-0.5 text-[10px] font-medium">
														Pro
													</span>
												)}
											</div>
											<div className="text-xs text-muted-foreground">
												{r.desc}
											</div>
										</div>
										{locked ? (
											<Link to="/pricing">
												<Button variant="outline" size="sm">
													Upgrade
												</Button>
											</Link>
										) : (
											<Switch
												checked={r.enabled}
												disabled={toggleRule.isPending || !isAdmin}
												onCheckedChange={(enabled) =>
													toggleRule.mutate({
														data: { rule: r.key, enabled: Boolean(enabled) },
													})
												}
											/>
										)}
									</motion.li>
								);
							})}
						</motion.ul>
					</Card>
				</Reveal>
			</div>
		</AppShell>
	);
}
