import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { db } from "@/db";
import { alertRules } from "@/db/schema";
import {
	ALERT_RULES,
	type AlertRuleItem,
	getOrgAlertRules,
} from "@/lib/alert-rules.server";
import { ensureSession } from "@/lib/auth.functions";
import { requireOrgAdmin } from "@/lib/org-access.server";
import { isPro, PRO_ONLY_ALERT_RULES } from "@/lib/plan";
import { getOrgPlan } from "@/lib/plan.server";
import { alertRuleKeySchema, parseInput } from "@/lib/validation";

export type { AlertRuleItem };

/** Every known rule for the active org, with its stored on/off state (or the rule's default, if never toggled). */
export const getAlertRules = createServerFn({ method: "GET" }).handler(
	async (): Promise<AlertRuleItem[]> => {
		const session = await ensureSession();
		const organizationId = session.session.activeOrganizationId;
		if (!organizationId) {
			return ALERT_RULES.map((r) => ({ ...r, enabled: r.defaultEnabled }));
		}
		return getOrgAlertRules(organizationId);
	},
);

export const setAlertRuleEnabled = createServerFn({ method: "POST" })
	.validator(
		parseInput(z.object({ rule: alertRuleKeySchema, enabled: z.boolean() })),
	)
	.handler(async ({ data }) => {
		const { organizationId } = await requireOrgAdmin();

		if (data.enabled && PRO_ONLY_ALERT_RULES.includes(data.rule)) {
			const plan = await getOrgPlan(organizationId);
			if (!isPro(plan)) {
				throw new Error(
					"This alert rule is a Pro feature. Upgrade to enable it.",
				);
			}
		}

		await db
			.insert(alertRules)
			.values({
				organizationId,
				rule: data.rule,
				enabled: data.enabled,
			})
			.onConflictDoUpdate({
				target: [alertRules.organizationId, alertRules.rule],
				set: { enabled: data.enabled },
			});
	});
