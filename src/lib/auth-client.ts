import { polarClient } from "@polar-sh/better-auth/client";
import {
	inferOrgAdditionalFields,
	organizationClient,
} from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import type { auth } from "@/lib/auth";

export const authClient = createAuthClient({
	plugins: [
		organizationClient({
			schema: inferOrgAdditionalFields<typeof auth>(),
		}),
		polarClient(),
	],
});
