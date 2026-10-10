import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { account, githubInstallations, member } from "@/db/schema";
import { auth } from "@/lib/auth";
import { getInstallation } from "@/lib/github-app.server";
import { isAdminRole } from "@/lib/roles";

/**
 * Links a GitHub App installation to a workspace — but only after proving
 * the signed-in user controls the GitHub account it was installed on.
 *
 * The setup redirect's installation_id is just a query parameter: anyone
 * can craft /api/github/setup?installation_id=<someone else's>. Without this
 * check, an attacker could link a victim's installation to their own
 * workspace and get tokens for the victim's repos. So the account is read
 * from GitHub (as the app, not from the URL) and matched against the user's
 * own GitHub identity: the same user id for a personal account, or admin
 * membership for an organization.
 */
export async function linkInstallation(opts: {
	userId: string;
	organizationId: string;
	installationId: string;
}): Promise<{ accountLogin: string }> {
	const [membership] = await db
		.select({ role: member.role })
		.from(member)
		.where(
			and(
				eq(member.organizationId, opts.organizationId),
				eq(member.userId, opts.userId),
			),
		)
		.limit(1);
	if (!membership || !isAdminRole(membership.role)) {
		throw new Error("Only workspace owners and admins can link GitHub.");
	}

	const [githubAccount] = await db
		.select({ id: account.id, githubUserId: account.accountId })
		.from(account)
		.where(
			and(eq(account.userId, opts.userId), eq(account.providerId, "github")),
		)
		.limit(1);
	if (!githubAccount) throw new Error("Sign in with GitHub first.");

	const installation = await getInstallation(opts.installationId).catch(() => {
		throw new Error(
			"That GitHub installation wasn't found. Install the app again from Vitalgate.",
		);
	});
	const { login, type, id: accountId } = installation.account;

	if (type === "User") {
		if (String(accountId) !== githubAccount.githubUserId) {
			throw new Error(
				`This installation belongs to @${login}, not your GitHub account.`,
			);
		}
	} else {
		const { accessToken } = await auth.api.getAccessToken({
			body: { accountId: githubAccount.id, userId: opts.userId },
		});
		const res = await fetch(
			`https://api.github.com/user/memberships/orgs/${encodeURIComponent(login)}`,
			{
				headers: {
					authorization: `Bearer ${accessToken}`,
					accept: "application/vnd.github+json",
					"x-github-api-version": "2022-11-28",
				},
			},
		);
		const membershipInOrg = res.ok
			? ((await res.json()) as { state?: string; role?: string })
			: null;
		if (
			membershipInOrg?.state !== "active" ||
			membershipInOrg.role !== "admin"
		) {
			throw new Error(
				`You need to be an owner of the @${login} GitHub organization to link it.`,
			);
		}
	}

	await db
		.insert(githubInstallations)
		.values({
			organizationId: opts.organizationId,
			installationId: String(installation.id),
			accountLogin: login,
			accountType: type,
		})
		.onConflictDoUpdate({
			target: [
				githubInstallations.organizationId,
				githubInstallations.installationId,
			],
			set: { accountLogin: login, accountType: type },
		});

	return { accountLogin: login };
}
