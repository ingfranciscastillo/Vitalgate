import { createServerFn } from "@tanstack/react-start";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { orgSubscriptions } from "@/db/schema";
import { ensureSession } from "@/lib/auth.functions";
import {
	type BillingInterval,
	type FounderOffer,
	getFounderOffer,
	intervalOf,
	isBillingConfigured,
	isYearlyAvailable,
} from "@/lib/billing.server";
import type { Plan } from "@/lib/plan";
import { getOrgPlan } from "@/lib/plan.server";

export interface BillingOverview {
	/** False when Polar isn't set up on this server, so there's nothing to buy. */
	configured: boolean;
	plan: Plan;
	/** The founding-member price (monthly only), while spots are left. */
	founder: FounderOffer | null;
	/** Whether Pro can be bought yearly too. */
	yearly: boolean;
	subscription: {
		status: string;
		interval: BillingInterval;
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
			yearly: isYearlyAvailable(),
			subscription: sub
				? {
						status: sub.status,
						interval: intervalOf(sub.productId),
						currentPeriodEnd: sub.currentPeriodEnd?.toISOString() ?? null,
						cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
						managedByYou: sub.customerUserId === session.user.id,
					}
				: null,
		};
	},
);

export interface PublicPricing {
	founder: FounderOffer | null;
	yearly: boolean;
}

/** Live pricing details for public pages (/pricing); no sign-in needed. */
export const getPublicPricing = createServerFn({ method: "GET" }).handler(
	async (): Promise<PublicPricing> => ({
		founder: await getFounderOffer(),
		yearly: isYearlyAvailable(),
	}),
);
