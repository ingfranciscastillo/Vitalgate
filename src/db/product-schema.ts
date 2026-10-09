import { relations, sql } from "drizzle-orm";
import {
	boolean,
	doublePrecision,
	integer,
	jsonb,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
} from "drizzle-orm/pg-core";
import type {
	Action,
	AlertChannel,
	AlertLevel,
	AlertRuleKey,
	IntegrationProvider,
	MetricKey,
	NotificationPrefKey,
	PrStatus,
	Severity,
} from "@/lib/mock-data";
import { organization, user } from "./auth-schema";

function id() {
	return text("id")
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID());
}

/**
 * A GitHub repository connected to a Vitalgate organization via the GitHub App
 * installation. Health/open-PR counts are computed from `pullRequests`, not
 * stored here.
 */
export const repos = pgTable(
	"repos",
	{
		id: id(),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		/** GitHub's numeric repo id, e.g. 123456789. Stable across renames. */
		githubRepoId: text("github_repo_id").notNull(),
		name: text("name").notNull(),
		/** owner/name, e.g. "acme/storefront" */
		fullName: text("full_name").notNull(),
		defaultBranch: text("default_branch").notNull(),
		private: boolean("private").notNull().default(false),
		/**
		 * Names (never values) of repo secrets the generated workflow forwards to
		 * the started server, e.g. ["DATABASE_URL", "GROQ_API_KEY"] — for repos
		 * whose production server needs more than just a port to boot without
		 * erroring on every request. The values stay in GitHub's own secret
		 * store; the workflow only ever references `secrets.<NAME>`.
		 */
		envVarNames: jsonb("env_var_names").notNull().$type<string[]>().default([]),
		/** Whether /api/ingest hands the workflow a results comment to post on the PR. */
		postPrComments: boolean("post_pr_comments").notNull().default(true),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(t) => [
		uniqueIndex("repos_organization_id_github_repo_id_unique").on(
			t.organizationId,
			t.githubRepoId,
		),
	],
);

/** One performance budget per metric per repo. */
export const budgets = pgTable(
	"budgets",
	{
		id: id(),
		repoId: text("repo_id")
			.notNull()
			.references(() => repos.id, { onDelete: "cascade" }),
		metric: text("metric").notNull().$type<MetricKey>(),
		/** Threshold value in the metric's native unit (ms, unitless CLS, or 0-100 score). */
		max: doublePrecision("max").notNull(),
		severity: text("severity").notNull().$type<Severity>(),
		action: text("action").notNull().$type<Action>(),
	},
	(t) => [uniqueIndex("budgets_repo_id_metric_unique").on(t.repoId, t.metric)],
);

/**
 * Metric values keyed by MetricKey, e.g. { LCP: 2380, INP: 180, CLS: 0.07 }.
 * Not every metric is guaranteed present (a run can fail partway through).
 */
type MetricSnapshot = Partial<Record<MetricKey, number>>;

export const pullRequests = pgTable(
	"pull_requests",
	{
		id: id(),
		repoId: text("repo_id")
			.notNull()
			.references(() => repos.id, { onDelete: "cascade" }),
		number: integer("number").notNull(),
		title: text("title").notNull(),
		/** GitHub login of the PR author. Not a Vitalgate user reference — most PR authors never sign in. */
		author: text("author").notNull(),
		branch: text("branch").notNull(),
		status: text("status").notNull().$type<PrStatus>(),
		openedAt: timestamp("opened_at").notNull(),
		/** Latest Lighthouse run on the PR's head commit. */
		metrics: jsonb("metrics").notNull().$type<MetricSnapshot>(),
		/** Latest Lighthouse run on the repo's default branch, at PR open time. */
		baseline: jsonb("baseline").notNull().$type<MetricSnapshot>(),
	},
	(t) => [
		uniqueIndex("pull_requests_repo_id_number_unique").on(t.repoId, t.number),
	],
);

/**
 * A CI token that authenticates a GitHub Action's ingest requests for one
 * organization. Only the SHA-256 hash is stored — the raw token is shown once
 * at creation (createOrgToken) and never again, same as a GitHub PAT.
 */
export const orgTokens = pgTable("org_tokens", {
	id: id(),
	organizationId: text("organization_id")
		.notNull()
		.references(() => organization.id, { onDelete: "cascade" }),
	tokenHash: text("token_hash").notNull().unique(),
	/** Last 4 chars of the raw token, so a user can tell tokens apart in a list without re-seeing the value. */
	lastFour: text("last_four").notNull(),
	createdAt: timestamp("created_at").defaultNow().notNull(),
	lastUsedAt: timestamp("last_used_at"),
});

export const alerts = pgTable("alerts", {
	id: id(),
	repoId: text("repo_id")
		.notNull()
		.references(() => repos.id, { onDelete: "cascade" }),
	/**
	 * Channels this alert actually reached (an email to at least one member,
	 * a Slack/Discord post). Empty when nothing was delivered — e.g. every
	 * member opted out and no integration is connected.
	 */
	deliveredTo: text("delivered_to")
		.array()
		.notNull()
		.default(sql`'{}'::text[]`)
		.$type<AlertChannel[]>(),
	level: text("level").notNull().$type<AlertLevel>(),
	title: text("title").notNull(),
	message: text("message").notNull(),
	createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * Per-org on/off state for a fixed set of alert rules (see AlertRuleKey).
 * Absence of a row means "use that rule's default" — rows only exist once an
 * org has actually flipped a rule away from its default, so a fresh org
 * doesn't need every rule seeded up front.
 */
export const alertRules = pgTable(
	"alert_rules",
	{
		id: id(),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		rule: text("rule").notNull().$type<AlertRuleKey>(),
		enabled: boolean("enabled").notNull(),
	},
	(t) => [
		uniqueIndex("alert_rules_organization_id_rule_unique").on(
			t.organizationId,
			t.rule,
		),
	],
);

export const reposRelations = relations(repos, ({ many, one }) => ({
	organization: one(organization, {
		fields: [repos.organizationId],
		references: [organization.id],
	}),
	budgets: many(budgets),
	pullRequests: many(pullRequests),
	alerts: many(alerts),
}));

export const orgTokensRelations = relations(orgTokens, ({ one }) => ({
	organization: one(organization, {
		fields: [orgTokens.organizationId],
		references: [organization.id],
	}),
}));

export const budgetsRelations = relations(budgets, ({ one }) => ({
	repo: one(repos, { fields: [budgets.repoId], references: [repos.id] }),
}));

export const pullRequestsRelations = relations(pullRequests, ({ one }) => ({
	repo: one(repos, { fields: [pullRequests.repoId], references: [repos.id] }),
}));

export const alertsRelations = relations(alerts, ({ one }) => ({
	repo: one(repos, { fields: [alerts.repoId], references: [repos.id] }),
}));

export const alertRulesRelations = relations(alertRules, ({ one }) => ({
	organization: one(organization, {
		fields: [alertRules.organizationId],
		references: [organization.id],
	}),
}));

/**
 * Per-user on/off state for a fixed set of email notification preferences
 * (see NotificationPrefKey) — global across every org the user belongs to,
 * not org-scoped like alertRules. Same "missing row = default" reasoning.
 */
export const notificationPrefs = pgTable(
	"notification_prefs",
	{
		id: id(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		pref: text("pref").notNull().$type<NotificationPrefKey>(),
		enabled: boolean("enabled").notNull(),
	},
	(t) => [
		uniqueIndex("notification_prefs_user_id_pref_unique").on(t.userId, t.pref),
	],
);

export const notificationPrefsRelations = relations(
	notificationPrefs,
	({ one }) => ({
		user: one(user, {
			fields: [notificationPrefs.userId],
			references: [user.id],
		}),
	}),
);

/**
 * One Slack or Discord incoming-webhook connection per org per provider,
 * from the OAuth "Add to Slack" / Discord webhook.incoming flow — not
 * better-auth's account table, which is per-user identity, not an org-level
 * service connection. The webhook URL is sensitive (anyone holding it can
 * post to that channel), so it's stored encrypted, never plaintext.
 */
export const integrations = pgTable(
	"integrations",
	{
		id: id(),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		provider: text("provider").notNull().$type<IntegrationProvider>(),
		/** Workspace/channel name for display, e.g. "Acme Inc · #perf-alerts". */
		label: text("label").notNull(),
		/** AES-256-GCM ciphertext, "iv.authTag.ciphertext" (each base64) — see crypto.server.ts. */
		encryptedWebhookUrl: text("encrypted_webhook_url").notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(t) => [
		uniqueIndex("integrations_organization_id_provider_unique").on(
			t.organizationId,
			t.provider,
		),
	],
);

export const integrationsRelations = relations(integrations, ({ one }) => ({
	organization: one(organization, {
		fields: [integrations.organizationId],
		references: [organization.id],
	}),
}));

export type NewRepo = typeof repos.$inferInsert;
export type RepoRow = typeof repos.$inferSelect;
export type NewBudget = typeof budgets.$inferInsert;
export type BudgetRow = typeof budgets.$inferSelect;
export type NewPullRequest = typeof pullRequests.$inferInsert;
export type PullRequestRow = typeof pullRequests.$inferSelect;
export type NewAlert = typeof alerts.$inferInsert;
export type AlertRow = typeof alerts.$inferSelect;
export type NewOrgToken = typeof orgTokens.$inferInsert;
export type OrgTokenRow = typeof orgTokens.$inferSelect;
export type NewAlertRule = typeof alertRules.$inferInsert;
export type AlertRuleRow = typeof alertRules.$inferSelect;
export type NewNotificationPref = typeof notificationPrefs.$inferInsert;
export type NotificationPrefRow = typeof notificationPrefs.$inferSelect;
export type NewIntegration = typeof integrations.$inferInsert;
export type IntegrationRow = typeof integrations.$inferSelect;
