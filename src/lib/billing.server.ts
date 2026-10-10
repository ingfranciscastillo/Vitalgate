import { checkout, polar, portal, webhooks } from "@polar-sh/better-auth";
import { createPolarCore, errors } from "@polar-sh/sdk/2026-10";
import { deleteExternalCustomers } from "@polar-sh/sdk/2026-10/services/customers";
import { revokeSubscriptions } from "@polar-sh/sdk/2026-10/services/subscriptions";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { member, organization, orgSubscriptions } from "@/db/schema";
import { getAppUrl } from "@/lib/app-url.server";
import { isAdminRole } from "@/lib/roles";

/**
 * Pro billing through Polar (merchant of record). A workspace is billed by
 * checking out with its id as `reference_id`, which Polar stores as
 * `metadata.referenceId` on the subscription; the webhooks below keep
 * org_subscriptions and organization.plan in sync with it.
 *
 * Env: POLAR_ACCESS_TOKEN, POLAR_WEBHOOK_SECRET, POLAR_PRO_PRODUCT_ID, and
 * POLAR_ENVIRONMENT ("sandbox" or "production"; sandbox unless set).
 */
export function isBillingConfigured(): boolean {
	const missing = REQUIRED_ENV.filter((name) => !process.env[name]);
	if (missing.length > 0 && missing.length < REQUIRED_ENV.length) {
		// Half-configured is almost always a mistake worth a log line.
		console.warn(`Polar billing is off: ${missing.join(", ")} not set`);
	}
	return missing.length === 0;
}

const REQUIRED_ENV = [
	"POLAR_ACCESS_TOKEN",
	"POLAR_WEBHOOK_SECRET",
	"POLAR_PRO_PRODUCT_ID",
] as const;

/** Statuses that keep a workspace on Pro. past_due stays Pro while Polar retries the payment. */
const PRO_STATUSES = new Set(["active", "trialing", "past_due"]);

export interface PolarSubscriptionEvent {
	id: string;
	status: string;
	product_id: string;
	current_period_end: string | null;
	cancel_at_period_end: boolean;
	modified_at: string | null;
	created_at: string;
	metadata: Record<string, unknown>;
	customer: { external_id?: string | null };
}

/**
 * Applies a subscription webhook to its workspace. Idempotent and safe
 * against reordered deliveries: an event older than the last one applied is
 * ignored. The subscription is only honoured if whoever paid is an owner or
 * admin of the workspace in `metadata.referenceId` — the adapter doesn't
 * check that membership itself.
 */
export async function applySubscriptionEvent(
	sub: PolarSubscriptionEvent,
): Promise<void> {
	const organizationId =
		typeof sub.metadata.referenceId === "string"
			? sub.metadata.referenceId
			: null;
	const userId = sub.customer.external_id ?? null;
	if (!organizationId || !userId) {
		console.warn(`Polar subscription ${sub.id} has no workspace or user`);
		return;
	}

	const [payer] = await db
		.select({ role: member.role })
		.from(member)
		.where(
			and(eq(member.organizationId, organizationId), eq(member.userId, userId)),
		)
		.limit(1);
	if (!payer || !isAdminRole(payer.role)) {
		console.warn(
			`Polar subscription ${sub.id}: user ${userId} can't bill workspace ${organizationId}`,
		);
		return;
	}

	const modifiedAt = new Date(sub.modified_at ?? sub.created_at);
	const [current] = await db
		.select()
		.from(orgSubscriptions)
		.where(eq(orgSubscriptions.organizationId, organizationId))
		.limit(1);
	if (current) {
		const sameSub = current.polarSubscriptionId === sub.id;
		if (
			sameSub &&
			current.polarModifiedAt &&
			current.polarModifiedAt > modifiedAt
		) {
			return; // an older delivery of the same subscription
		}
		// Another subscription is already keeping this workspace on Pro; a
		// different, inactive one mustn't downgrade it.
		if (
			!sameSub &&
			PRO_STATUSES.has(current.status) &&
			!PRO_STATUSES.has(sub.status)
		) {
			return;
		}
	}

	const row = {
		polarSubscriptionId: sub.id,
		status: sub.status,
		productId: sub.product_id,
		customerUserId: userId,
		currentPeriodEnd: sub.current_period_end
			? new Date(sub.current_period_end)
			: null,
		cancelAtPeriodEnd: sub.cancel_at_period_end,
		polarModifiedAt: modifiedAt,
		updatedAt: new Date(),
	};
	await db.batch([
		db
			.insert(orgSubscriptions)
			.values({ organizationId, ...row })
			.onConflictDoUpdate({
				target: orgSubscriptions.organizationId,
				set: row,
			}),
		db
			.update(organization)
			.set({ plan: PRO_STATUSES.has(sub.status) ? "pro" : "free" })
			.where(eq(organization.id, organizationId)),
	]);
}

/** Polar API client for this server's environment. */
export function polarCore() {
	return createPolarCore({
		accessToken: process.env.POLAR_ACCESS_TOKEN ?? "",
		environment:
			process.env.POLAR_ENVIRONMENT === "production" ? "production" : "sandbox",
	});
}

/**
 * Deletes the user's Polar customer, which cancels their subscriptions at
 * once and anonymizes their billing details (past orders stay on record).
 * A user who never checked out has no customer, which is fine.
 */
export async function deletePolarCustomer(userId: string): Promise<void> {
	if (!isBillingConfigured()) return;
	try {
		await deleteExternalCustomers(polarCore())(userId, { anonymize: true });
	} catch (err) {
		if (err instanceof errors.ResourceNotFound) return;
		throw err;
	}
}

/**
 * Ends a workspace's subscription now, whoever pays for it — for when the
 * workspace itself is being deleted. Already-ended ones are fine.
 */
export async function revokeOrgSubscription(organizationId: string) {
	if (!isBillingConfigured()) return;
	const [sub] = await db
		.select({
			id: orgSubscriptions.polarSubscriptionId,
			status: orgSubscriptions.status,
		})
		.from(orgSubscriptions)
		.where(eq(orgSubscriptions.organizationId, organizationId))
		.limit(1);
	if (!sub || !PRO_STATUSES.has(sub.status)) return;
	try {
		await revokeSubscriptions(polarCore())(sub.id);
	} catch (err) {
		if (err instanceof errors.ResourceNotFound) return;
		throw err;
	}
}

/** The Better Auth plugin, or nothing when Polar isn't configured (e.g. local dev without keys). */
export function polarPlugins() {
	if (!isBillingConfigured()) return [];
	const client = polarCore();
	const billingTab = `${getAppUrl()}/settings?tab=billing`;
	const onSubscription = async (payload: { data: PolarSubscriptionEvent }) =>
		applySubscriptionEvent(payload.data);
	return [
		polar({
			client,
			// Customers are created at checkout (external id = user id), so a
			// Polar outage can never block signing up.
			createCustomerOnSignUp: false,
			use: [
				checkout({
					products: [
						{ productId: process.env.POLAR_PRO_PRODUCT_ID ?? "", slug: "pro" },
					],
					successUrl: `${billingTab}&checkout=success`,
					returnUrl: billingTab,
					authenticatedUsersOnly: true,
				}),
				portal({ returnUrl: billingTab }),
				webhooks({
					secret: process.env.POLAR_WEBHOOK_SECRET ?? "",
					onSubscriptionCreated: onSubscription,
					onSubscriptionUpdated: onSubscription,
					onSubscriptionActive: onSubscription,
					onSubscriptionCanceled: onSubscription,
					onSubscriptionUncanceled: onSubscription,
					onSubscriptionRevoked: onSubscription,
					onSubscriptionPastDue: onSubscription,
				}),
			],
		}),
	];
}
