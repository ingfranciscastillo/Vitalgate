import { createHash, randomBytes } from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { orgTokens } from "@/db/schema";
import { ensureSession } from "@/lib/auth.functions";
import { requireOrgAdmin } from "@/lib/org-access.server";
import { idSchema, parseInput } from "@/lib/validation";

function generateRawToken() {
	return `vgate_${randomBytes(24).toString("hex")}`;
}

function hashToken(raw: string) {
	return createHash("sha256").update(raw).digest("hex");
}

export const createOrgToken = createServerFn({ method: "POST" }).handler(
	async () => {
		const { organizationId } = await requireOrgAdmin();

		const raw = generateRawToken();
		await db.insert(orgTokens).values({
			organizationId,
			tokenHash: hashToken(raw),
			lastFour: raw.slice(-4),
		});

		// Shown once — we only ever stored the hash.
		return { token: raw };
	},
);

export const listOrgTokens = createServerFn({ method: "GET" }).handler(
	async () => {
		const session = await ensureSession();
		const organizationId = session.session.activeOrganizationId;
		if (!organizationId) return [];

		return db
			.select({
				id: orgTokens.id,
				lastFour: orgTokens.lastFour,
				createdAt: orgTokens.createdAt,
				lastUsedAt: orgTokens.lastUsedAt,
			})
			.from(orgTokens)
			.where(eq(orgTokens.organizationId, organizationId))
			.orderBy(desc(orgTokens.createdAt));
	},
);

export const revokeOrgToken = createServerFn({ method: "POST" })
	.validator(parseInput(idSchema))
	.handler(async ({ data: tokenId }) => {
		const { organizationId } = await requireOrgAdmin();

		await db
			.delete(orgTokens)
			.where(
				and(
					eq(orgTokens.id, tokenId),
					eq(orgTokens.organizationId, organizationId),
				),
			);
	});
