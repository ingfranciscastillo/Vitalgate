import { createServerFn } from "@tanstack/react-start";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { orgSubscriptions } from "@/db/schema";
import { ensureSession } from "@/lib/auth.functions";
import {
	type FounderOffer,
	getFounderOffer,
	isBillingConfigured,
} from "@/lib/billing.server";
import type { Plan } from "@/lib/plan";
import { getOrgPlan } from "@/lib/plan.server";

export interface BillingOverview {
	/** False when Polar isn't set up on this server, so there's nothing to buy. */
	configured: boolean;
	plan: Plan;
	/** The founding-member price, while spots are left. */
	founder: FounderOffer | null;
	subscription: {
		status: string;
		currentPeriodEnd: string | null;
		cancelAtPeriodEnd: boolean;
		/** Whether the signed-in user is the Polar customer who can open the billing portal. */
		managedByYou: boolean;
	} | null;
}

/** The active workspace's plan and subscription, for the Billing tab. */
export const getBillingOverview = createServerFn({ method: "GET" }).handler(
	async (): Promise<BillingOverview | null> => {
		const session = await ensureSession();
		const organizationId = session.session.activeOrganizationId;
		if (!organizationId) return null;

		const [plan, founder, [sub]] = await Promise.all([
			getOrgPlan(organizationId),
			getFounderOffer(),
			db
				.select()
				.from(orgSubscriptions)
				.where(eq(orgSubscriptions.organizationId, organizationId))
				.limit(1),
		]);
		return {
			configured: isBillingConfigured(),
			plan,
			founder,
			subscription: sub
				? {
						status: sub.status,
						currentPeriodEnd: sub.currentPeriodEnd?.toISOString() ?? null,
						cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
						managedByYou: sub.customerUserId === session.user.id,
					}
				: null,
		};
	},
);

/** The founding-member offer for public pages (/pricing); no sign-in needed. */
export const getPublicFounderOffer = createServerFn({ method: "GET" }).handler(
	async (): Promise<FounderOffer | null> => getFounderOffer(),
);
