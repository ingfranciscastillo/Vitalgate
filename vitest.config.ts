import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const src = fileURLToPath(new URL("./src", import.meta.url));

// Separate from vite.config.ts: the app's Vite plugins (TanStack Start,
// Nitro, devtools) aren't needed to test plain modules.
export default defineConfig({
	resolve: {
		alias: [
			{ find: /^@\//, replacement: `${src}/` },
			{ find: /^#\//, replacement: `${src}/` },
		],
	},
	test: {
		environment: "node",
		include: ["src/**/*.test.ts"],
		env: {
			// Some modules under test import db/index.ts, which only checks that
			// this is set; nothing here connects to a database.
			DATABASE_URL: "postgresql://test:test@localhost:5432/test",
			BETTER_AUTH_SECRET: "test-secret-0123456789abcdef0123456789",
			INTEGRATION_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
			GITHUB_APP_WEBHOOK_SECRET: "test-webhook-secret",
		},
	},
});
