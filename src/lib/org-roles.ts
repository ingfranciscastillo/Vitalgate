import { authClient } from "@/lib/auth-client";
import { isAdminRole } from "@/lib/roles";

export { isAdminRole };

/** Whether the signed-in user can change the active workspace's config; undefined while loading. */
export function useIsOrgAdmin(): boolean | undefined {
	const { data: session } = authClient.useSession();
	const { data: org } = authClient.useActiveOrganization();
	if (!session || !org) return undefined;
	const me = org.members.find((m) => m.userId === session.user.id);
	return !!me && isAdminRole(me.role);
}
