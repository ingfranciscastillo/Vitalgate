import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { member } from "@/db/schema";
import { ensureSession } from "@/lib/auth.functions";
import { isAdminRole } from "@/lib/roles";

/**
 * Throws unless the signed-in user is an owner or admin of their active
 * organization (see org-roles.ts for what that gates). Returns the session
 * and organizationId so callers don't look them up twice. Members,
 * invitations, and org settings are enforced by better-auth's organization
 * plugin itself; this covers Vitalgate's own server functions.
 *
 * Its own .server.ts file for the same reason as plan.server.ts: it touches
 * `db` outside a createServerFn handler, so it must never be imported by
 * client code.
 */
export async function requireOrgAdmin() {
	const session = await ensureSession();
	const organizationId = session.session.activeOrganizationId;
	if (!organizationId) throw new Error("No active organization");

	const [row] = await db
		.select({ role: member.role })
		.from(member)
		.where(
			and(
				eq(member.organizationId, organizationId),
				eq(member.userId, session.user.id),
			),
		)
		.limit(1);
	if (!row || !isAdminRole(row.role)) {
		throw new Error(
			"Only workspace owners and admins can change this. Ask an admin for access.",
		);
	}

	return { session, organizationId };
}
