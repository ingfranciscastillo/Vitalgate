import { z } from "zod";

/**
 * The contact form's single source of truth: the form in routes/contact.tsx
 * validates against it as the visitor types, and sendContactMessage
 * validates against it again on the server (the endpoint is public, so the
 * client-side check is only a convenience).
 */
export const CONTACT_LIMITS = { name: 100, email: 254, message: 5000 };

export const contactSchema = z.object({
	name: z
		.string()
		.trim()
		.min(1, "Enter your name.")
		.max(CONTACT_LIMITS.name, "Name is too long."),
	email: z
		.string()
		.trim()
		.min(1, "Enter your email address.")
		.max(CONTACT_LIMITS.email, "Email is too long.")
		.pipe(z.email("Enter a valid email address.")),
	message: z
		.string()
		.trim()
		.min(1, "Enter a message.")
		.max(
			CONTACT_LIMITS.message,
			`Keep the message under ${CONTACT_LIMITS.message} characters.`,
		),
	/**
	 * Honeypot. Hidden from people and assistive tech, so only bots that fill
	 * in every input give it a value; the server then drops the message.
	 */
	website: z.string().max(200),
});

export type ContactValues = z.input<typeof contactSchema>;
