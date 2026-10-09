import { createServerFn } from "@tanstack/react-start";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { budgets, repos } from "@/db/schema";
import { actionFor, updateBudgetsSchema } from "@/lib/budgets";
import { requireOrgAdmin } from "@/lib/org-access.server";
import { parseInput } from "@/lib/validation";

/**
 * Replaces a repo's budgets with the given set — the Budgets tab on a repo's
 * detail page. A metric left out has no budget. Owners and admins only.
 */
export const updateRepoBudgets = createServerFn({ method: "POST" })
	.validator(parseInput(updateBudgetsSchema))
	.handler(async ({ data }) => {
		const { organizationId } = await requireOrgAdmin();

		// Scoped to the active org, not just the id — another org's repo id
		// must not be editable.
		const [repo] = await db
			.select({ id: repos.id })
			.from(repos)
			.where(
				and(
					eq(repos.id, data.repoId),
					eq(repos.organizationId, organizationId),
				),
			)
			.limit(1);
		if (!repo) throw new Error("Repository not found");

		// One batch, so a failed insert can't leave the repo with no budgets.
		const remove = db.delete(budgets).where(eq(budgets.repoId, repo.id));
		if (data.budgets.length === 0) {
			await remove;
			return;
		}
		await db.batch([
			remove,
			db.insert(budgets).values(
				data.budgets.map((b) => ({
					repoId: repo.id,
					metric: b.metric,
					max: b.max,
					severity: b.severity,
					action: actionFor(b.severity),
				})),
			),
		]);
	});
