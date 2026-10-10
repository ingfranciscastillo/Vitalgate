import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";
import { organization } from "better-auth/plugins/organization";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { getAppUrl } from "@/lib/app-url.server";
import { sendEmail } from "@/lib/email.server";
import { escapeHtml } from "@/lib/html";
import { isAdminRole } from "@/lib/roles";

function slugify(input: string) {
	return input
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/(^-|-$)/g, "");
}

export const auth = betterAuth({
	secret: process.env.BETTER_AUTH_SECRET,
	database: drizzleAdapter(db, {
		provider: "pg",
		schema,
	}),
	emailAndPassword: {
		enabled: true,
		// Accounts are only ever created through GitHub sign-in. Email+password
		// stays enabled solely so a GitHub user can add a password to their
		// existing account (setInitialPassword); without this, anyone could
		// POST /api/auth/sign-up/email and create an unverified account + org.
		disableSignUp: true,
	},
	account: {
		// The stored GitHub OAuth token (identity-only, see the scopes below) is
		// encrypted at rest; read it only through auth.api.getAccessToken, never
		// from the account table directly.
		encryptOAuthTokens: true,
	},
	socialProviders: {
		github: {
			clientId: process.env.GITHUB_CLIENT_ID as string,
			clientSecret: process.env.GITHUB_CLIENT_SECRET as string,
			// Login is identity only. Repo access (listing repos, committing the
			// workflow, commenting on PRs) goes through the Vitalgate GitHub App,
			// on just the repos each account picks — see github-app.server.ts.
			// - read:user, user:email: who is signing in
			// - read:org: read-only, to confirm the user is an owner of a GitHub
			//   organization before linking that org's app installation
			//   (github-installation.server.ts)
			scope: ["read:user", "user:email", "read:org"],
		},
	},
	rateLimit: {
		// The default in-memory store is per serverless instance on Vercel, so
		// it barely limits anything; the database store is shared.
		storage: "database",
		customRules: {
			"/api/auth/sign-in/email": { window: 60, max: 5 },
			"/api/auth/sign-up/email": { window: 60, max: 3 },
		},
	},
	databaseHooks: {
		user: {
			create: {
				// Every screen in the product (repos, budgets, team) is scoped to
				// an organization. Without this, a fresh sign-up has none and the
				// whole app renders empty. Give them a personal workspace they can
				// rename later from Settings -> Organization.
				after: async (user) => {
					// userId can't be combined with session headers (better-auth
					// treats that as ambiguous "who is this for" and rejects it) —
					// this call is impersonation-style, not tied to the request.
					await auth.api.createOrganization({
						body: {
							name: `${user.name}'s Workspace`,
							slug: `${slugify(user.name || user.email.split("@")[0])}-${user.id.slice(0, 6)}`,
							userId: user.id,
						},
					});
				},
			},
		},
		session: {
			create: {
				// activeOrganizationId lives on the session row, not the user, so
				// it starts null on every new session (each sign-in, each device)
				// even once the user already has an org. Without this the
				// WorkspaceSwitcher and every org-scoped query have nothing to
				// point at. Picks the first org until real org-switching UI exists.
				//
				// Set via `before` (mutating the row before insert), not `after` +
				// auth.api.setActiveOrganization: that API resolves "current
				// session" from the request's cookie header, which a fresh
				// sign-in's request doesn't carry yet (the cookie is only set on
				// the response about to be sent) — it throws UNAUTHORIZED. Querying
				// membership directly by session.userId sidesteps that entirely.
				before: async (session) => {
					if (session.activeOrganizationId || !session.userId) return;
					const [membership] = await db
						.select({ organizationId: schema.member.organizationId })
						.from(schema.member)
						.where(eq(schema.member.userId, session.userId))
						.limit(1);
					if (membership) {
						return {
							data: {
								...session,
								activeOrganizationId: membership.organizationId,
							},
						};
					}
				},
			},
		},
	},
	plugins: [
		// Default owner/admin/member roles and permissions for now. The product
		// UI (team.tsx) shows Owner/Admin/Developer/Viewer — that's a separate
		// custom-role/access-control decision, not made yet. Members keep the
		// UI label as display text until real permission checks are designed.
		organization({
			// Extra workspaces are a Pro perk: each one comes with its own Free
			// plan, so otherwise anyone could stack free repos across workspaces.
			// The personal workspace made at sign-up is a server-side call with
			// a userId and no session, which better-auth doesn't run this for.
			allowUserToCreateOrganization: async (user) => {
				const proMemberships = await db
					.select({ role: schema.member.role })
					.from(schema.member)
					.innerJoin(
						schema.organization,
						eq(schema.member.organizationId, schema.organization.id),
					)
					.where(
						and(
							eq(schema.member.userId, user.id),
							eq(schema.organization.plan, "pro"),
						),
					);
				return proMemberships.some((m) => isAdminRole(m.role));
			},
			// The link lands on /accept-invitation/$invitationId, which sends
			// signed-out visitors through GitHub sign-in first. better-auth only
			// lets the invitation be accepted by a user whose account email
			// matches the invited address.
			sendInvitationEmail: async ({
				id,
				email,
				role,
				organization,
				inviter,
			}) => {
				const link = `${getAppUrl()}/accept-invitation/${id}`;
				const orgName = escapeHtml(organization.name);
				const inviterName = escapeHtml(inviter.user.name || inviter.user.email);
				await sendEmail({
					to: [email],
					subject: `${inviter.user.name || inviter.user.email} invited you to ${organization.name} on Vitalgate`,
					html: `
						<div style="font-family: -apple-system, sans-serif; max-width: 480px; color: #111;">
							<h2 style="margin-bottom: 4px;">Join ${orgName} on Vitalgate</h2>
							<p>${inviterName} invited you to the <strong>${orgName}</strong> workspace as ${escapeHtml(role)}.</p>
							<p><a href="${link}">Accept the invitation →</a></p>
							<p style="color: #666; font-size: 13px;">Sign in with the GitHub account that uses ${escapeHtml(email)}. The invitation expires in 48 hours. If you weren't expecting it, you can ignore this email.</p>
						</div>
					`,
				});
			},
			schema: {
				organization: {
					additionalFields: {
						// Billing plan for the org. input: false keeps it out of the
						// create/update organization API — nothing except server-side
						// code (there's no billing webhook yet, so today that means a
						// manual DB update) should ever change this.
						plan: {
							type: "string",
							required: true,
							defaultValue: "free",
							input: false,
						},
					},
				},
			},
		}),
		tanstackStartCookies(),
	],
});
