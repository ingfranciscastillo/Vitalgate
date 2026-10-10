import { createServerFn } from "@tanstack/react-start";
import { and, eq, inArray, ne } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { member, organization, repos, user } from "@/db/schema";
import { ensureSession } from "@/lib/auth.functions";
import {
	deletePolarCustomer,
	revokeOrgSubscription,
} from "@/lib/billing.server";
import { deleteWorkflowFile } from "@/lib/github";
import { getInstallationToken } from "@/lib/github-app.server";
import { parseInput } from "@/lib/validation";

const isOwner = (role: string) =>
	role.split(",").some((r) => r.trim() === "owner");

/**
 * Workspaces the user's account deletion would delete (they're the only
 * owner) and the ones they'd just leave.
 */
async function deletionPlan(userId: string) {
	const memberships = await db
		.select({
			organizationId: member.organizationId,
			role: member.role,
			name: organization.name,
		})
		.from(member)
		.innerJoin(organization, eq(organization.id, member.organizationId))
		.where(eq(member.userId, userId));

	const owned = memberships.filter((m) => isOwner(m.role));
	const otherOwners =
		owned.length === 0
			? []
			: await db
					.select({
						organizationId: member.organizationId,
						role: member.role,
					})
					.from(member)
					.where(
						and(
							inArray(
								member.organizationId,
								owned.map((m) => m.organizationId),
							),
							ne(member.userId, userId),
						),
					);
	const hasOtherOwner = new Set(
		otherOwners.filter((m) => isOwner(m.role)).map((m) => m.organizationId),
	);

	const deleted = owned.filter((m) => !hasOtherOwner.has(m.organizationId));
	const deletedIds = new Set(deleted.map((m) => m.organizationId));
	const left = memberships.filter((m) => !deletedIds.has(m.organizationId));
	return { deleted, left };
}

export interface AccountDeletionPreview {
	email: string;
	deletedWorkspaces: string[];
	leftWorkspaces: string[];
}

/** What deleting the signed-in user's account would do, for the confirmation dialog. */
export const getAccountDeletionPreview = createServerFn({
	method: "GET",
}).handler(async (): Promise<AccountDeletionPreview> => {
	const session = await ensureSession();
	const { deleted, left } = await deletionPlan(session.user.id);
	return {
		email: session.user.email,
		deletedWorkspaces: deleted.map((w) => w.name),
		leftWorkspaces: left.map((w) => w.name),
	};
});

/**
 * Deletes the signed-in user's account. In order, so a failure part-way
 * never leaves a subscription billing for data that's gone:
 * 1. Polar: their customer is deleted (canceling what they pay for) and
 *    subscriptions of workspaces about to be deleted are revoked.
 * 2. Workspaces where they're the only owner are deleted, with their repos,
 *    budgets, pull requests and alerts; Vitalgate's workflow file is
 *    removed from those repos on a best-effort basis.
 * 3. The user row, which cascades to sessions, linked GitHub account,
 *    memberships and preferences.
 * Requires typing the account's email, checked here as well as in the UI.
 */
export const deleteMyAccount = createServerFn({ method: "POST" })
	.validator(parseInput(z.object({ confirmEmail: z.string().max(320) })))
	.handler(async ({ data }) => {
		const session = await ensureSession();
		const userId = session.user.id;
		if (
			data.confirmEmail.trim().toLowerCase() !==
			session.user.email.toLowerCase()
		) {
			throw new Error("Type your account's email address to confirm.");
		}

		const { deleted } = await deletionPlan(userId);
		const deletedIds = deleted.map((w) => w.organizationId);

		try {
			await deletePolarCustomer(userId);
			for (const id of deletedIds) await revokeOrgSubscription(id);
		} catch (err) {
			console.error("Account deletion: Polar cleanup failed", err);
			throw new Error(
				"Couldn't cancel your Pro subscription, so nothing was deleted. Try again in a minute, or contact us.",
			);
		}

		if (deletedIds.length > 0) {
			const workspaceRepos = await db
				.select({
					fullName: repos.fullName,
					installationId: repos.installationId,
				})
				.from(repos)
				.where(inArray(repos.organizationId, deletedIds));
			await Promise.allSettled(
				workspaceRepos.map(async (r) =>
					deleteWorkflowFile(
						await getInstallationToken(r.installationId),
						r.fullName,
					),
				),
			);
			await db.delete(organization).where(inArray(organization.id, deletedIds));
		}

		await db.delete(user).where(eq(user.id, userId));
		return { deletedWorkspaces: deleted.length };
	});
