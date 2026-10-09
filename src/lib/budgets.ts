import { z } from "zod";
import type { Action, MetricKey, Severity } from "@/lib/mock-data";

/**
 * Metrics a budget can be set on: the ones a Lighthouse lab run actually
 * reports. INP is left out on purpose — it needs real user interactions, so
 * a budget on it could never fire (TBT is its lab stand-in).
 */
export const BUDGET_METRICS = ["PERF", "LCP", "CLS", "FCP", "TBT"] as const;
export type BudgetMetric = (typeof BUDGET_METRICS)[number];

/** How each metric's limit is entered and what range is sensible. */
export const BUDGET_INPUT: Record<
	BudgetMetric,
	{ unit: string; min: number; max: number; step: number; hint: string }
> = {
	PERF: {
		unit: "score",
		min: 1,
		max: 100,
		step: 1,
		hint: "Minimum score, 1–100",
	},
	LCP: { unit: "ms", min: 100, max: 60000, step: 50, hint: "Maximum, in ms" },
	CLS: { unit: "", min: 0, max: 5, step: 0.01, hint: "Maximum, unitless" },
	FCP: { unit: "ms", min: 100, max: 60000, step: 50, hint: "Maximum, in ms" },
	TBT: { unit: "ms", min: 0, max: 60000, step: 10, hint: "Maximum, in ms" },
};

/**
 * The stored `action` column is derived, not chosen: only `severity` decides
 * whether a run fails (see /api/ingest). Kept in sync so the column never
 * contradicts it.
 */
export function actionFor(severity: Severity): Action {
	return severity === "fail" ? "block" : "comment";
}

const budgetSchema = z
	.object({
		metric: z.enum(BUDGET_METRICS),
		max: z.number().finite(),
		severity: z.enum(["fail", "warn"]),
	})
	.superRefine((b, ctx) => {
		const { min, max } = BUDGET_INPUT[b.metric];
		if (b.max < min || b.max > max) {
			ctx.addIssue({
				code: "custom",
				message: `${b.metric} limit must be between ${min} and ${max}.`,
			});
		}
	});

/** The full set of budgets for one repo; saving replaces whatever was there. */
export const updateBudgetsSchema = z.object({
	repoId: z.string().min(1).max(64),
	budgets: z
		.array(budgetSchema)
		.max(BUDGET_METRICS.length)
		.refine(
			(list) => new Set(list.map((b) => b.metric)).size === list.length,
			"Each metric can only have one budget.",
		),
});

export type BudgetInput = z.input<typeof budgetSchema>;

export function isBudgetMetric(metric: MetricKey): metric is BudgetMetric {
	return (BUDGET_METRICS as readonly MetricKey[]).includes(metric);
}
