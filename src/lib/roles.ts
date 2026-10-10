/**
 * Roles allowed to change a workspace's configuration: connect/disconnect
 * repos, edit budgets, connect integrations, toggle alert rules. Plain
 * members can see everything in the workspace but not change it.
 * Server-side checks: requireOrgAdmin (org-access.server.ts); UI: the
 * useIsOrgAdmin hook (org-roles.ts).
 */
const ADMIN_ROLES = new Set(["owner", "admin"]);

/** better-auth stores multiple roles as a comma-separated string. */
export function isAdminRole(role: string): boolean {
	return role.split(",").some((r) => ADMIN_ROLES.has(r.trim()));
}
