import { createServerFn } from "@tanstack/react-start";
import { sendEmail } from "@/lib/email.server";
import { escapeHtml } from "@/lib/html";

interface ContactInput {
	name: string;
	email: string;
	message: string;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Relays the public contact form to whoever should read it — there's no
 * inbox wired into this app, so CONTACT_EMAIL just names an external one.
 * Reuses the same Resend sender as the weekly digest; see email.server.ts's
 * note on why a recipient outside the Resend account's own address needs a
 * verified sending domain to actually receive it.
 */
export const sendContactMessage = createServerFn({ method: "POST" })
	.validator((data: ContactInput) => data)
	.handler(async ({ data }) => {
		const name = data.name.trim();
		const email = data.email.trim();
		const message = data.message.trim();
		if (!name || !message) {
			throw new Error("Name and message are required.");
		}
		if (!EMAIL_PATTERN.test(email)) {
			throw new Error("Enter a valid email address.");
		}

		const to = process.env.CONTACT_EMAIL;
		if (!to) {
			throw new Error(
				"CONTACT_EMAIL is not set. Add it to .env.local (and to Vercel's " +
					"project env vars) with the address that should receive contact " +
					"form messages.",
			);
		}

		await sendEmail({
			to: [to],
			subject: `Vitalgate contact form: ${name}`,
			html: `
				<p><strong>From:</strong> ${escapeHtml(name)} (${escapeHtml(email)})</p>
				<p>${escapeHtml(message).replace(/\n/g, "<br>")}</p>
			`.trim(),
		});
	});
