import { CheckCircleIcon, XCircleIcon } from "@phosphor-icons/react";
import { renderPrComment } from "@/lib/pr-comment";

/**
 * Example run shown on marketing pages. Rendered through the same
 * renderPrComment the real PR comment uses, so the preview can't drift
 * from what Vitalgate actually posts.
 */
const EXAMPLE_MARKDOWN = renderPrComment({
	status: "failing",
	metrics: { PERF: 81, LCP: 2910, CLS: 0.02, FCP: 1420, TBT: 240 },
	baseline: { PERF: 92, LCP: 2110, CLS: 0.02, FCP: 1390, TBT: 180 },
	budgets: [
		{ metric: "PERF", max: 90, severity: "fail" },
		{ metric: "LCP", max: 2500, severity: "fail" },
		{ metric: "CLS", max: 0.1, severity: "warn" },
		{ metric: "FCP", max: 1800, severity: "warn" },
		{ metric: "TBT", max: 300, severity: "warn" },
	],
	reportUrl: "#",
	isFirstRun: false,
	runs: 3,
});

const lines = EXAMPLE_MARKDOWN.split("\n");
const HEADLINE = (lines.find((l) => l.includes("**Vitalgate:**")) ?? "")
	.replace(/^\S+\s/, "")
	.replace("**Vitalgate:**", "")
	.trim();
const ROWS = lines
	.filter(
		(l) =>
			l.startsWith("| ") && !l.startsWith("| Metric") && !l.startsWith("| ---"),
	)
	.map((l) =>
		l
			.slice(2, -2)
			.split(" | ")
			.map((cell) => cell.trim()),
	);

/**
 * What a pull request gets from Vitalgate: the failing "Vitalgate" check
 * and the results comment, drawn as they appear on GitHub.
 */
export function PrCommentPreview({ repo = "acme/storefront#1042" }) {
	return (
		<figure className="overflow-hidden rounded-md border border-border bg-card text-left">
			<div className="flex items-center gap-2 border-b border-border px-4 py-2.5 text-xs">
				<span className="grid size-5 place-items-center rounded-full bg-brand font-mono text-[10px] font-bold text-brand-foreground">
					V
				</span>
				<span className="font-semibold">vitalgate[bot]</span>
				<span className="text-muted-foreground">commented on {repo}</span>
			</div>
			<div className="px-4 py-4">
				<p className="flex items-center gap-1.5 text-sm">
					<XCircleIcon
						className="size-4 shrink-0 text-destructive"
						weight="fill"
					/>
					<span>
						<strong>Vitalgate:</strong> {HEADLINE}
					</span>
				</p>
				<div className="mt-3 overflow-x-auto">
					<table className="w-full min-w-[440px] border-collapse text-xs">
						<thead>
							<tr className="text-left text-muted-foreground">
								<th className="border border-border px-2.5 py-1.5 font-medium">
									Metric
								</th>
								<th className="border border-border px-2.5 py-1.5 font-medium">
									This PR
								</th>
								<th className="border border-border px-2.5 py-1.5 font-medium">
									Change vs baseline
								</th>
								<th className="border border-border px-2.5 py-1.5 font-medium">
									Budget
								</th>
								<th className="border border-border px-2.5 py-1.5">
									<span className="sr-only">Result</span>
								</th>
							</tr>
						</thead>
						<tbody>
							{ROWS.map(([metric, value, change, budget, result]) => (
								<tr key={metric}>
									<td className="border border-border px-2.5 py-1.5">
										{metric}
									</td>
									<td className="border border-border px-2.5 py-1.5 font-mono">
										{value}
									</td>
									<td className="border border-border px-2.5 py-1.5 font-mono">
										{change}
									</td>
									<td className="border border-border px-2.5 py-1.5 font-mono">
										{budget}
									</td>
									<td className="border border-border px-2.5 py-1.5 text-center">
										{result}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
				<p className="mt-2 text-[11px] text-muted-foreground">
					Median of 3 Lighthouse lab runs on this workflow's runner.{" "}
					<span className="text-primary">Full report on Vitalgate</span>
				</p>
			</div>
			<div className="space-y-2 border-t border-border bg-muted/40 px-4 py-3 text-xs">
				<div className="flex items-center gap-2">
					<XCircleIcon className="size-4 text-destructive" weight="fill" />
					<span className="font-semibold">Vitalgate</span>
					<span className="text-muted-foreground">
						A required budget was exceeded
					</span>
					<span className="ml-auto text-[10px] font-medium text-muted-foreground">
						Required
					</span>
				</div>
				<div className="flex items-center gap-2">
					<CheckCircleIcon className="size-4 text-success" weight="fill" />
					<span className="font-semibold">Vercel</span>
					<span className="text-muted-foreground">Preview deployed</span>
				</div>
			</div>
			<figcaption className="sr-only">
				Example of the comment and check Vitalgate adds to a pull request
			</figcaption>
		</figure>
	);
}
