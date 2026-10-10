import { describe, expect, it } from "vitest";
import {
	connectNudgeEmail,
	firstAuditEmail,
	prNudgeEmail,
	welcomeEmail,
} from "@/lib/lifecycle-emails";

const appUrl = "https://vitalgate.example";

describe("lifecycle emails", () => {
	it("greets by first name and escapes it", () => {
		const { html } = welcomeEmail({ name: "<b>Ada</b> Lovelace", appUrl });
		expect(html).toContain("Welcome to Vitalgate, &lt;b&gt;Ada&lt;/b&gt;");
		expect(html).not.toContain("<b>Ada</b>");
		expect(html).toContain(`href="${appUrl}/repositories/new"`);
	});

	it("falls back when the name is empty", () => {
		expect(connectNudgeEmail({ name: " ", appUrl }).html).toContain(
			"Hi there,",
		);
	});

	it("points the PR nudge at the repo on GitHub, with a way to opt out", () => {
		const { html } = prNudgeEmail({
			name: "Ada",
			repoFullName: "acme/web",
			appUrl,
		});
		expect(html).toContain('href="https://github.com/acme/web/compare"');
		expect(html).toContain('href="https://github.com/acme/web/actions"');
		expect(html).toContain("Getting started tips");
	});

	it("describes the first audit's result and links to it", () => {
		const email = firstAuditEmail({
			name: "Ada",
			repoFullName: "acme/web",
			prNumber: 42,
			status: "failing",
			pullUrl: `${appUrl}/pulls/p1`,
		});
		expect(email.subject).toBe("acme/web #42: your first Vitalgate check");
		expect(email.html).toContain("its check failed");
		expect(email.html).toContain(`href="${appUrl}/pulls/p1"`);
		expect(email.html).toContain("/settings/branches");
	});
});
