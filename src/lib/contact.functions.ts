import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { sendEmail } from "@/lib/email.server";
import { escapeHtml } from "@/lib/html";
import { consumeRateLimit, getClientIp } from "@/lib/rate-limit.server";
import { parseInput } from "@/lib/validation";

/** Also mirrored as maxLength on the form fields in routes/contact.tsx. */
export const CONTACT_LIMITS = { name: 100, email: 254, message: 5000 };

const contactSchema = z.object({
	name: z
		.string()
		.trim()
		.min(1, "Enter your name.")
		.max(CONTACT_LIMITS.name, "Name is too long."),
	email: z
		.email("Enter a valid email address.")
		.trim()
		.max(CONTACT_LIMITS.email, "Email is too long."),
	message: z
		.string()
		.trim()
		.min(1, "Enter a message.")
		.max(
			CONTACT_LIMITS.message,
			`Keep the message under ${CONTACT_LIMITS.message} characters.`,
		),
	/** Honeypot: hidden from people, filled in by naive bots. */
	website: z.string().max(200).optional(),
});

/**
 * Relays the public contact form to CONTACT_EMAIL through Resend. It's an
 * unauthenticated endpoint that sends email, so it's rate limited per IP and
 * bounded in size — otherwise a script could flood the inbox and burn the
 * Resend quota that invitations and digests depend on.
 */
export const sendContactMessage = createServerFn({ method: "POST" })
	.validator(parseInput(contactSchema))
	.handler(async ({ data }) => {
		// Pretend it worked so the bot has no signal to adapt to.
		if (data.website) return;

		const allowed = await consumeRateLimit(`contact:${getClientIp()}`, {
			max: 3,
			windowSeconds: 10 * 60,
		});
		if (!allowed) {
			throw new Error(
				"You've sent several messages recently. Please wait a few minutes and try again.",
			);
		}

		const to = process.env.CONTACT_EMAIL;
		if (!to) {
			// Server log only — visitors don't need to see deployment config.
			console.error(
				"CONTACT_EMAIL is not set; add it to the env vars to receive contact form messages.",
			);
			throw new Error(
				"The contact form is temporarily unavailable. Please try again later.",
			);
		}

		await sendEmail({
			to: [to],
			replyTo: data.email,
			// No line breaks in a header, whatever the visitor typed.
			subject: `Vitalgate contact form: ${data.name.replace(/[\r\n]+/g, " ")}`,
			html: `
				<p><strong>From:</strong> ${escapeHtml(data.name)} (${escapeHtml(data.email)})</p>
				<p>${escapeHtml(data.message).replace(/\n/g, "<br>")}</p>
			`.trim(),
		});
	});
