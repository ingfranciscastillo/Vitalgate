import { authClient } from "@/lib/auth-client";

/**
 * Roles allowed to change a workspace's configuration: connect/disconnect
 * repos, mint/revoke CI tokens, connect integrations, toggle alert rules.
 * Plain members can see everything in the workspace but not change it.
 * Enforced server-side by requireOrgAdmin (org-access.server.ts); the hook
 * below only decides what the UI offers.
 */
const ADMIN_ROLES = new Set(["owner", "admin"]);

/** better-auth stores multiple roles as a comma-separated string. */
export function isAdminRole(role: string): boolean {
	return role.split(",").some((r) => ADMIN_ROLES.has(r.trim()));
}

/** Whether the signed-in user can change the active workspace's config; undefined while loading. */
export function useIsOrgAdmin(): boolean | undefined {
	const { data: session } = authClient.useSession();
	const { data: org } = authClient.useActiveOrganization();
	if (!session || !org) return undefined;
	const me = org.members.find((m) => m.userId === session.user.id);
	return !!me && isAdminRole(me.role);
}
