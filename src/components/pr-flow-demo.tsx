import {
	CheckCircleIcon,
	GitCommitIcon,
	GitPullRequestIcon,
	WarningIcon,
	XCircleIcon,
} from "@phosphor-icons/react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import { LogoMark } from "@/components/logo";
import { LogoLoader } from "@/components/logo-loader";

/**
 * The product in one loop: a pull request deploys, Vitalgate audits it,
 * the check fails with the results comment, a fix lands, everything goes
 * green. Plays on its own; under reduced motion it holds the failed state.
 */

type Step = "deploying" | "running" | "failed" | "fixing" | "passed";

const TIMELINE: { step: Step; ms: number }[] = [
	{ step: "deploying", ms: 1600 },
	{ step: "running", ms: 2600 },
	{ step: "failed", ms: 4300 },
	{ step: "fixing", ms: 2200 },
	{ step: "passed", ms: 3800 },
];

const RESULTS = {
	failed: [
		{ metric: "Performance score", value: "71", budget: "≥ 90", ok: false },
		{
			metric: "Largest Contentful Paint",
			value: "3.42s",
			budget: "≤ 2.50s",
			ok: false,
		},
		{
			metric: "Cumulative Layout Shift",
			value: "0.020",
			budget: "≤ 0.100",
			ok: true,
		},
	],
	passed: [
		{ metric: "Performance score", value: "93", budget: "≥ 90", ok: true },
		{
			metric: "Largest Contentful Paint",
			value: "1.98s",
			budget: "≤ 2.50s",
			ok: true,
		},
		{
			metric: "Cumulative Layout Shift",
			value: "0.020",
			budget: "≤ 0.100",
			ok: true,
		},
	],
};

function useLoop(reduce: boolean | null): Step {
	const [index, setIndex] = useState(reduce ? 2 : 0);
	useEffect(() => {
		if (reduce) {
			setIndex(2);
			return;
		}
		const id = setTimeout(
			() => setIndex((i) => (i + 1) % TIMELINE.length),
			TIMELINE[index].ms,
		);
		return () => clearTimeout(id);
	}, [index, reduce]);
	return TIMELINE[index].step;
}

const fade = {
	initial: { opacity: 0, y: 6 },
	animate: { opacity: 1, y: 0 },
	exit: { opacity: 0, y: -4 },
	transition: { duration: 0.25, ease: [0.16, 1, 0.3, 1] as const },
};

function CheckRow({
	name,
	state,
	text,
}: {
	name: string;
	state: "running" | "failed" | "passed";
	text: string;
}) {
	return (
		<div className="flex items-center gap-2.5 px-3.5 py-2.5 text-xs">
			<span className="grid size-4 place-items-center">
				<AnimatePresence mode="wait" initial={false}>
					<motion.span key={state} {...fade} className="grid">
						{state === "running" ? (
							<LogoLoader decorative className="size-4 text-muted-foreground" />
						) : state === "failed" ? (
							<XCircleIcon className="size-4 text-destructive" weight="fill" />
						) : (
							<CheckCircleIcon className="size-4 text-success" weight="fill" />
						)}
					</motion.span>
				</AnimatePresence>
			</span>
			<span className="font-semibold">{name}</span>
			<AnimatePresence mode="wait" initial={false}>
				<motion.span
					key={text}
					{...fade}
					className="truncate text-muted-foreground"
				>
					{text}
				</motion.span>
			</AnimatePresence>
			{name === "Vitalgate" && (
				<span className="ml-auto text-[10px] font-medium text-muted-foreground">
					Required
				</span>
			)}
		</div>
	);
}

export function PrFlowDemo() {
	const reduce = useReducedMotion();
	const step = useLoop(reduce);
	const fixed = step === "fixing" || step === "passed";

	const vercel =
		step === "deploying" || step === "fixing"
			? { state: "running" as const, text: "Deploying preview…" }
			: { state: "passed" as const, text: "Preview deployed" };
	const vitalgate =
		step === "deploying"
			? { state: "running" as const, text: "Waiting for the preview" }
			: step === "running" || step === "fixing"
				? { state: "running" as const, text: "Running Lighthouse, 3 runs" }
				: step === "failed"
					? { state: "failed" as const, text: "A required budget was exceeded" }
					: { state: "passed" as const, text: "All budgets passed" };
	const comment =
		step === "failed" ? "failed" : step === "passed" ? "passed" : null;

	return (
		<figure
			aria-label="Animated example: Vitalgate fails a pull request that slows the page, then passes it after a fix"
			data-step={step}
			className="overflow-hidden rounded-md border border-border bg-card text-left shadow-sm"
		>
			<div className="flex items-center gap-2 border-b border-border px-4 py-3">
				<GitPullRequestIcon className="size-4 text-success" weight="bold" />
				<span className="truncate text-sm font-semibold">
					Lazy-load the hero image
				</span>
				<span className="font-mono text-xs text-muted-foreground">#1042</span>
				<span className="ml-auto rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-medium text-success">
					Open
				</span>
			</div>

			<div className="space-y-1.5 px-4 pt-3 font-mono text-[11px] text-muted-foreground">
				<div className="flex items-center gap-2">
					<GitCommitIcon className="size-3.5" />
					<span className="text-foreground/80">a1f3c9e</span>
					feat: lazy-load the hero image
				</div>
				{/* Always rendered, only faded: its space is reserved so the card
				    never grows mid-loop (no layout shift on the landing page). */}
				<motion.div
					aria-hidden={!fixed}
					initial={false}
					animate={{ opacity: fixed ? 1 : 0, y: fixed ? 0 : 4 }}
					transition={fade.transition}
					className="flex items-center gap-2 text-foreground"
				>
					<GitCommitIcon className="size-3.5 text-brand" />
					<span>7b2d10e</span>
					fix: preload the hero image
				</motion.div>
			</div>

			<div className="mx-4 mt-3 divide-y divide-border rounded-md border border-border bg-muted/30">
				<CheckRow name="Vercel" {...vercel} />
				<CheckRow name="Vitalgate" {...vitalgate} />
			</div>

			<div className="min-h-[232px] px-4 pb-4 pt-3">
				<AnimatePresence mode="wait">
					{comment && (
						<motion.div
							key={comment}
							{...fade}
							className="rounded-md border border-border"
						>
							<div className="flex items-center gap-2 border-b border-border px-3 py-2 text-[11px]">
								<span className="grid size-5 place-items-center rounded-full border border-border bg-background">
									<LogoMark className="size-3.5" />
								</span>
								<span className="font-semibold">vitalgate[bot]</span>
								<span className="text-muted-foreground">commented</span>
							</div>
							<div className="px-3 py-2.5">
								<p className="flex items-center gap-1.5 text-xs">
									{comment === "failed" ? (
										<XCircleIcon
											className="size-3.5 shrink-0 text-destructive"
											weight="fill"
										/>
									) : (
										<CheckCircleIcon
											className="size-3.5 shrink-0 text-success"
											weight="fill"
										/>
									)}
									<span>
										<strong>Vitalgate:</strong>{" "}
										{comment === "failed"
											? "a required performance budget was exceeded"
											: "all performance budgets passed"}
									</span>
								</p>
								<table className="mt-2 w-full text-[11px]">
									<tbody className="divide-y divide-border">
										{RESULTS[comment].map((r, i) => (
											<motion.tr
												key={r.metric}
												initial={{ opacity: 0 }}
												animate={{ opacity: 1 }}
												transition={{ delay: 0.15 + i * 0.08 }}
											>
												<td className="py-1.5 pr-2">{r.metric}</td>
												<td
													className={`py-1.5 pr-2 text-right font-mono ${r.ok ? "" : "text-destructive"}`}
												>
													{r.value}
												</td>
												<td className="py-1.5 pr-2 text-right font-mono text-muted-foreground">
													{r.budget}
												</td>
												<td className="w-5 py-1.5 text-right">
													{r.ok ? (
														<CheckCircleIcon
															className="ml-auto size-3.5 text-success"
															weight="fill"
														/>
													) : (
														<XCircleIcon
															className="ml-auto size-3.5 text-destructive"
															weight="fill"
														/>
													)}
												</td>
											</motion.tr>
										))}
									</tbody>
								</table>
								{comment === "failed" && (
									<p className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
										<WarningIcon
											className="size-3.5 text-warning"
											weight="fill"
										/>
										Merge is blocked until the budget passes.
									</p>
								)}
							</div>
						</motion.div>
					)}
				</AnimatePresence>
			</div>
		</figure>
	);
}
