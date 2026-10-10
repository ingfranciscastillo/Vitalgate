import { Script } from "node:vm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getAppUrl } from "@/lib/app-url.server";
import { decryptSecret, encryptSecret } from "@/lib/crypto.server";
import {
	vitalgatePreviewWorkflowYaml,
	vitalgateWorkflowYaml,
} from "@/lib/workflow-template";

describe("encryptSecret / decryptSecret", () => {
	it("round-trips and uses a fresh IV each time", () => {
		const a = encryptSecret("https://hooks.slack.com/services/T/B/x");
		const b = encryptSecret("https://hooks.slack.com/services/T/B/x");
		expect(a).not.toBe(b);
		expect(decryptSecret(a)).toBe("https://hooks.slack.com/services/T/B/x");
	});

	it("refuses tampered ciphertext", () => {
		const [iv, tag, data] = encryptSecret("secret").split(".");
		const flipped = Buffer.from(data, "base64");
		flipped[0] ^= 1;
		expect(() =>
			decryptSecret(`${iv}.${tag}.${flipped.toString("base64")}`),
		).toThrow();
	});
});

describe("getAppUrl", () => {
	afterEach(() => vi.unstubAllEnvs());

	it("falls back to localhost only outside production", () => {
		vi.stubEnv("BETTER_AUTH_URL", "");
		vi.stubEnv("NODE_ENV", "development");
		expect(getAppUrl()).toBe("http://localhost:3000");
	});

	it("requires an https URL in production", () => {
		vi.stubEnv("NODE_ENV", "production");
		vi.stubEnv("BETTER_AUTH_URL", "");
		expect(() => getAppUrl()).toThrow(/not set/);
		vi.stubEnv("BETTER_AUTH_URL", "http://vitalgate.example");
		expect(() => getAppUrl()).toThrow(/https/);
		vi.stubEnv("BETTER_AUTH_URL", "https://vitalgate.example/some/path");
		expect(getAppUrl()).toBe("https://vitalgate.example");
	});
});

describe("vitalgateWorkflowYaml", () => {
	const yaml = vitalgateWorkflowYaml({
		defaultBranch: "main",
		packageManager: "pnpm",
		pnpmVersion: "10.0.0",
		yarnIsBerry: false,
		startScript: "start",
		port: 3000,
		envVarNames: ["DATABASE_URL"],
		vitalgateOrigin: "https://vitalgate.example",
	});
	const script = yaml.split("node -e '\n")[1].split("\n          '\n")[0];

	it("embeds a report script that is valid JavaScript", () => {
		expect(() => new Script(script)).not.toThrow();
	});

	it("keeps single quotes out of the script (it's wrapped in node -e '...')", () => {
		expect(script).not.toContain("'");
	});

	it("authenticates with GitHub OIDC and grants only what the job needs", () => {
		expect(yaml).toContain("id-token: write");
		expect(yaml).toContain("pull-requests: write");
		expect(yaml).toContain("ACTIONS_ID_TOKEN_REQUEST_URL");
		expect(yaml).not.toContain("VITALGATE_TOKEN");
	});

	it("forwards the configured secrets and reports to the configured origin", () => {
		// biome-ignore lint/suspicious/noTemplateCurlyInString: a GitHub Actions expression, not JS
		expect(yaml).toContain("DATABASE_URL: ${{ secrets.DATABASE_URL }}");
		expect(script).toContain('"https://vitalgate.example/api/ingest"');
		expect(yaml.startsWith("# Managed by Vitalgate.")).toBe(true);
	});
});

describe("vitalgatePreviewWorkflowYaml", () => {
	const yaml = vitalgatePreviewWorkflowYaml({
		vitalgateOrigin: "https://vitalgate.example",
	});
	const script = yaml.split("node -e '\n")[1].split("\n          '\n")[0];

	it("runs on successful non-production deployments, without building", () => {
		expect(yaml).toContain("deployment_status:");
		expect(yaml).toContain("github.event.deployment_status.state == 'success'");
		expect(yaml).toContain(
			"github.event.deployment.production_environment != true",
		);
		expect(yaml).not.toContain("actions/checkout");
		expect(yaml).not.toContain("pull_request:");
	});

	it("audits the deployment URL, with Vercel's bypass header when set", () => {
		expect(yaml).toContain('npx --yes lighthouse "$PREVIEW_URL"');
		expect(yaml).toContain(
			'EXTRA_HEADERS=(--extra-headers "{\\"x-vercel-protection-bypass\\":\\"$VERCEL_BYPASS\\"}")',
		);
	});

	it("reports with a valid script and leaves PR details to Vitalgate", () => {
		expect(() => new Script(script)).not.toThrow();
		expect(script).not.toContain("'");
		expect(yaml).toContain("id-token: write");
		expect(yaml).not.toContain("PR_TITLE:");
	});
});
