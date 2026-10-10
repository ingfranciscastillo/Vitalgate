import { z } from "zod";
import type {
	AlertRuleKey,
	IntegrationProvider,
	NotificationPrefKey,
} from "@/lib/mock-data";

/**
 * Runtime schemas for server function inputs. A server function is a public
 * HTTP endpoint: the TypeScript type on its input only describes what our
 * own client sends, not what can arrive.
 */

/** Row ids (text columns holding crypto.randomUUID() values). */
export const idSchema = z.string().min(1).max(64);

export const integrationProviderSchema = z.enum([
	"slack",
	"discord",
]) satisfies z.ZodType<IntegrationProvider>;

export const alertRuleKeySchema = z.enum([
	"budget_violation",
	"regression_3day",
	"score_below_80",
	"weekly_digest",
]) satisfies z.ZodType<AlertRuleKey>;

export const notificationPrefKeySchema = z.enum([
	"critical_alerts",
	"warning_alerts",
	"daily_digest",
	"weekly_summary",
]) satisfies z.ZodType<NotificationPrefKey>;

/** Names of repo secrets forwarded to the audit; sanitized again before use. */
export const envVarNamesSchema = z.array(z.string().max(100)).max(50);

/**
 * GitHub repo as sent by the connect page. fullName goes into GitHub API
 * paths and defaultBranch into the generated workflow YAML, so both are
 * restricted to characters that can't break out of either.
 */
export const connectRepoSchema = z.object({
	id: z.string().regex(/^\d{1,20}$/, "Invalid GitHub repository id"),
	name: z.string().min(1).max(100),
	fullName: z
		.string()
		.max(200)
		// owner/name; "." and ".." are rejected so the value can't walk the
		// GitHub API path it's interpolated into.
		.regex(
			/^(?!\.{1,2}\/)[\w.-]+\/(?!\.{1,2}$)[\w.-]+$/,
			"Invalid repository name",
		),
	defaultBranch: z
		.string()
		.min(1)
		.max(255)
		.regex(/^[^\s"'`\\$]+$/, "Unsupported branch name"),
	private: z.boolean(),
});

export const connectRepositoriesSchema = z.object({
	repos: z.array(connectRepoSchema).min(1).max(100),
	preset: z.enum(["default", "strict", "relaxed", "custom"]),
	/** When false, every preset budget is created as a warning, so the check never fails. */
	branchProtect: z.boolean(),
	/** Whether the workflow posts a results comment on each PR (default on). */
	postComments: z.boolean().optional(),
	/** Build the app in GitHub Actions, or audit the host's preview deployments. */
	auditMode: z.enum(["build", "preview"]).default("build"),
	/** A package.json script name; it's written into the workflow's run step. */
	startScript: z
		.string()
		.max(100)
		.regex(/^[\w:.-]*$/, "Start script must be a package.json script name")
		.optional(),
	port: z.number().int().min(1).max(65535).optional(),
	envVarNames: envVarNamesSchema.optional(),
});

/**
 * Wraps a schema as a server function validator that throws a plain Error
 * with the first issue's message — passing the schema directly would send
 * the client a serialized ZodError, which toasts render as raw JSON.
 */
export function parseInput<S extends z.ZodType>(schema: S) {
	return (input: z.input<S>): z.output<S> => {
		const result = schema.safeParse(input);
		if (!result.success) {
			throw new Error(result.error.issues[0]?.message ?? "Invalid input");
		}
		return result.data;
	};
}
