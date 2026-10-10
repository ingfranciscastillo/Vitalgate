import {
	ArrowSquareOutIcon,
	CheckCircleIcon,
	CircleIcon,
	ConfettiIcon,
	XIcon,
} from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { authClient } from "@/lib/auth-client";
import { getGithubInstallUrl } from "@/lib/integrations.functions";
import { integrationsOverviewQueryOptions } from "@/lib/integrations.queries";
import { useIsOrgAdmin } from "@/lib/org-roles";

const dismissKey = (orgId: string) => `vitalgate:getting-started:${orgId}`;

function readDismissed(orgId: string): boolean {
	try {
		return localStorage.getItem(dismissKey(orgId)) === "1";
	} catch {
		return false;
	}
}

/**
 * First-run checklist on the dashboard, from sign-up to the first audited
 * pull request — the moment Vitalgate shows its value. Each step checks
 * itself off from real workspace data; after the first audit it turns into
 * a one-time "you're set" card. Owners and admins only, since members
 * can't connect anything. Dismissing it is remembered per browser.
 */
export function GettingStarted({
	repoFullNames,
	prCount,
}: {
	repoFullNames: string[];
	prCount: number;
}) {
	const isAdmin = useIsOrgAdmin();
	const { data: org } = authClient.useActiveOrganization();
	const { data: integrations } = useQuery(integrationsOverviewQueryOptions());
	const [dismissed, setDismissed] = useState(true);
	const [opening, setOpening] = useState(false);

	const orgId = org?.id;
	useEffect(() => {
		if (orgId) setDismissed(readDismissed(orgId));
	}, [orgId]);

	if (!isAdmin || !orgId || !integrations || dismissed) return null;

	const dismiss = () => {
		try {
			localStorage.setItem(dismissKey(orgId), "1");
		} catch {}
		setDismissed(true);
	};

	const closeButton = (
		<button
			type="button"
			onClick={dismiss}
			aria-label="Hide getting started"
			className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
		>
			<XIcon className="h-4 w-4" />
		</button>
	);

	if (prCount > 0) {
		return (
			<Card className="mb-6 flex items-start gap-4 border-success/40 p-5">
				<ConfettiIcon className="mt-0.5 h-6 w-6 shrink-0 text-success" />
				<div className="flex-1">
					<h2 className="font-semibold">Your first pull request is audited</h2>
					<p className="mt-1 text-sm text-muted-foreground">
						Every new push gets the same check. Make the "Vitalgate" check
						required in your branch protection rules so a broken budget can't be
						merged.
					</p>
					<div className="mt-3 flex flex-wrap gap-2">
						<Link to="/pulls">
							<Button size="sm">See the results</Button>
						</Link>
						<Link to="/team">
							<Button size="sm" variant="outline">
								Invite your team
							</Button>
						</Link>
					</div>
				</div>
				{closeButton}
			</Card>
		);
	}

	const installed = integrations.github.installations.length > 0;
	const firstRepo = repoFullNames[0];

	const installApp = async () => {
		setOpening(true);
		try {
			window.location.href = await getGithubInstallUrl({ data: "connect" });
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Could not open GitHub");
			setOpening(false);
		}
	};

	const steps = [
		{
			title: "Create your account",
			body: "Signed in with GitHub.",
			done: true,
			action: null,
		},
		{
			title: "Install the GitHub App",
			body: "Pick which repositories Vitalgate can access. You can change it any time.",
			done: installed,
			action: (
				<Button size="sm" disabled={opening} onClick={installApp}>
					{opening ? "Opening GitHub…" : "Install GitHub App"}
				</Button>
			),
		},
		{
			title: "Connect a repository",
			body: "Vitalgate adds a workflow that audits each pull request, with budgets you can edit.",
			done: repoFullNames.length > 0,
			action: (
				<Link to="/repositories/new">
					<Button size="sm">Connect a repository</Button>
				</Link>
			),
		},
		{
			title: "Open a pull request",
			body: "Any change will do. A few minutes later it gets the Vitalgate check and a results comment.",
			done: false,
			action: firstRepo ? (
				<a
					href={`https://github.com/${firstRepo}/compare`}
					target="_blank"
					rel="noreferrer"
				>
					<Button size="sm">
						Open a pull request on GitHub
						<ArrowSquareOutIcon className="ml-1.5 h-3.5 w-3.5" />
					</Button>
				</a>
			) : null,
		},
	];
	const doneCount = steps.filter((s) => s.done).length;
	const current = steps.findIndex((s) => !s.done);

	return (
		<Card className="mb-6 p-5">
			<div className="flex items-start justify-between gap-4">
				<div>
					<h2 className="font-semibold">Get started</h2>
					<p className="mt-0.5 text-xs text-muted-foreground">
						{doneCount} of {steps.length} done. A few minutes to your first
						audited pull request.
					</p>
				</div>
				{closeButton}
			</div>
			<div
				className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted"
				role="progressbar"
				aria-valuemin={0}
				aria-valuemax={steps.length}
				aria-valuenow={doneCount}
				aria-label="Getting started progress"
			>
				<div
					className="h-full rounded-full bg-brand transition-[width] duration-500 ease-out"
					style={{ width: `${(doneCount / steps.length) * 100}%` }}
				/>
			</div>
			<ol className="mt-4 space-y-3">
				{steps.map((step, i) => (
					<li key={step.title} className="flex gap-3">
						{step.done ? (
							<CheckCircleIcon
								className="mt-0.5 h-5 w-5 shrink-0 text-success"
								weight="fill"
							/>
						) : (
							<CircleIcon
								className={`mt-0.5 h-5 w-5 shrink-0 ${i === current ? "text-brand" : "text-muted-foreground/50"}`}
							/>
						)}
						<div className="min-w-0 flex-1">
							<div
								className={`text-sm font-medium ${step.done ? "text-muted-foreground line-through" : i === current ? "" : "text-muted-foreground"}`}
							>
								{step.title}
							</div>
							{i === current && (
								<>
									<p className="mt-0.5 text-xs text-muted-foreground">
										{step.body}
									</p>
									{step.action && <div className="mt-2.5">{step.action}</div>}
								</>
							)}
						</div>
					</li>
				))}
			</ol>
		</Card>
	);
}
