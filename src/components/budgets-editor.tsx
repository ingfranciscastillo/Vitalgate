import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
	BUDGET_INPUT,
	BUDGET_METRICS,
	type BudgetMetric,
	isBudgetMetric,
} from "@/lib/budgets";
import { METRIC_META, type MetricKey, type Severity } from "@/lib/mock-data";
import { updateRepoBudgets } from "@/lib/repo-settings.functions";

/** What a metric starts at when it's switched on and had no budget (the "default" preset). */
const DEFAULTS: Record<BudgetMetric, { max: number; severity: Severity }> = {
	PERF: { max: 90, severity: "fail" },
	LCP: { max: 2500, severity: "fail" },
	CLS: { max: 0.1, severity: "warn" },
	FCP: { max: 1800, severity: "warn" },
	TBT: { max: 300, severity: "warn" },
};

interface Row {
	enabled: boolean;
	/** Kept as typed text so a half-typed number ("0.") isn't reformatted under the cursor. */
	value: string;
	severity: Severity;
}

function initialRows(
	existing: { metric: MetricKey; max: number; severity: Severity }[],
): Record<BudgetMetric, Row> {
	const byMetric = new Map(existing.map((b) => [b.metric, b]));
	return Object.fromEntries(
		BUDGET_METRICS.map((metric) => {
			const b = byMetric.get(metric);
			return [
				metric,
				b
					? { enabled: true, value: String(b.max), severity: b.severity }
					: {
							enabled: false,
							value: String(DEFAULTS[metric].max),
							severity: DEFAULTS[metric].severity,
						},
			];
		}),
	) as Record<BudgetMetric, Row>;
}

/** Problem with a row's limit, or undefined if it's valid. */
function rowError(metric: BudgetMetric, row: Row): string | undefined {
	if (!row.enabled) return undefined;
	const n = Number(row.value);
	const { min, max } = BUDGET_INPUT[metric];
	if (row.value.trim() === "" || !Number.isFinite(n)) return "Enter a number.";
	if (n < min || n > max) return `Between ${min} and ${max}.`;
	return undefined;
}

/**
 * The Budgets tab on a repo's detail page. Admins edit every measurable
 * metric in place and save them together; members see the same rows read-only.
 */
export function BudgetsEditor({
	repoId,
	budgets,
	canEdit,
}: {
	repoId: string;
	budgets: { metric: MetricKey; max: number; severity: Severity }[];
	canEdit: boolean;
}) {
	const queryClient = useQueryClient();
	const [rows, setRows] = useState(() => initialRows(budgets));
	const [saved, setSaved] = useState(() =>
		JSON.stringify(initialRows(budgets)),
	);
	const ignoredInp = budgets.some((b) => !isBudgetMetric(b.metric));
	const changed = JSON.stringify(rows) !== saved;
	// A leftover INP budget counts as unsaved: saving is how it gets removed.
	const dirty = changed || ignoredInp;
	const errors = Object.fromEntries(
		BUDGET_METRICS.map((m) => [m, rowError(m, rows[m])]),
	) as Record<BudgetMetric, string | undefined>;
	const hasErrors = Object.values(errors).some(Boolean);

	const save = useMutation({
		mutationFn: updateRepoBudgets,
		onSuccess: () => {
			setSaved(JSON.stringify(rows));
			queryClient.invalidateQueries({ queryKey: ["repos", repoId] });
			toast.success("Budgets saved");
		},
		onError: (err) =>
			toast.error(
				err instanceof Error ? err.message : "Could not save budgets",
			),
	});

	const update = (metric: BudgetMetric, patch: Partial<Row>) =>
		setRows((r) => ({ ...r, [metric]: { ...r[metric], ...patch } }));

	const onSave = () =>
		save.mutate({
			data: {
				repoId,
				budgets: BUDGET_METRICS.filter((m) => rows[m].enabled).map((m) => ({
					metric: m,
					max: Number(rows[m].value),
					severity: rows[m].severity,
				})),
			},
		});

	return (
		<Card className="p-0 overflow-hidden">
			<div className="border-b border-border px-5 py-4">
				<h2 className="font-semibold text-sm">Performance budgets</h2>
				<p className="mt-1 text-xs text-muted-foreground">
					Checked on every pull request. A broken <b>required</b> budget fails
					the Vitalgate check; a <b>warning</b> only shows up in the PR comment
					and alerts.
					{!canEdit && " Only workspace owners and admins can change them."}
				</p>
			</div>

			<ul className="divide-y divide-border">
				{BUDGET_METRICS.map((metric) => {
					const row = rows[metric];
					const input = BUDGET_INPUT[metric];
					const error = errors[metric];
					const id = `budget-${metric}`;
					return (
						<li
							key={metric}
							className="grid gap-3 px-5 py-4 sm:grid-cols-[1fr_auto_auto_auto] sm:items-center"
						>
							<div className="min-w-0">
								<span className="font-mono text-sm font-medium">{metric}</span>
								<span className="ml-2 text-xs text-muted-foreground">
									{METRIC_META[metric].label}
								</span>
							</div>

							<div className="flex items-center gap-2">
								<Switch
									id={`${id}-on`}
									checked={row.enabled}
									disabled={!canEdit}
									onCheckedChange={(v) =>
										update(metric, { enabled: Boolean(v) })
									}
									aria-label={`Budget on ${metric}`}
								/>
								<span className="w-6 text-xs text-muted-foreground">
									{row.enabled ? "On" : "Off"}
								</span>
							</div>

							<div className="space-y-1">
								<div className="flex items-center gap-2">
									<span className="w-8 text-right font-mono text-xs text-muted-foreground">
										{metric === "PERF" ? "≥" : "≤"}
									</span>
									<Input
										id={id}
										type="number"
										inputMode="decimal"
										min={input.min}
										max={input.max}
										step={input.step}
										value={row.value}
										disabled={!canEdit || !row.enabled}
										onChange={(e) => update(metric, { value: e.target.value })}
										aria-label={`${metric} limit (${input.hint})`}
										aria-invalid={error ? true : undefined}
										className="h-8 w-28 font-mono text-sm"
									/>
									<span className="w-10 text-xs text-muted-foreground">
										{input.unit}
									</span>
								</div>
								{error && (
									<p
										role="alert"
										className="text-right text-xs text-destructive"
									>
										{error}
									</p>
								)}
							</div>

							<select
								value={row.severity}
								disabled={!canEdit || !row.enabled}
								onChange={(e) =>
									update(metric, { severity: e.target.value as Severity })
								}
								aria-label={`${metric} severity`}
								className="h-8 rounded-md border border-input bg-background px-2 text-sm disabled:opacity-50"
							>
								<option value="fail">Required</option>
								<option value="warn">Warning</option>
							</select>
						</li>
					);
				})}
			</ul>

			{ignoredInp && (
				<p className="border-t border-border px-5 py-3 text-xs text-muted-foreground">
					This repo also had an INP budget. Lighthouse lab runs can't measure
					INP, so it never fired; saving removes it. TBT is its lab stand-in.
				</p>
			)}

			{canEdit && (
				<div className="flex items-center justify-end gap-3 border-t border-border px-5 py-3">
					{changed && (
						<Button
							variant="ghost"
							size="sm"
							disabled={save.isPending}
							onClick={() => setRows(JSON.parse(saved))}
						>
							Discard
						</Button>
					)}
					<Button
						size="sm"
						disabled={!dirty || hasErrors || save.isPending}
						onClick={onSave}
					>
						{save.isPending ? "Saving…" : "Save budgets"}
					</Button>
				</div>
			)}
		</Card>
	);
}
