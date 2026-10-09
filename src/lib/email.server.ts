import { Resend } from "resend";

let client: Resend | null = null;

/**
 * Lazily constructed so importing this module never throws when
 * RESEND_API_KEY isn't set yet — only actually sending an email does, with a
 * message that says exactly what's missing instead of a bare SDK error.
 */
function getResendClient(): Resend {
	if (!process.env.RESEND_API_KEY) {
		throw new Error(
			"RESEND_API_KEY is not set. Add it to .env.local (and to Vercel's " +
				"project env vars) — get one from https://resend.com/api-keys.",
		);
	}
	client ??= new Resend(process.env.RESEND_API_KEY);
	return client;
}

/**
 * Without a domain verified in Resend, the sandbox sender
 * (onboarding@resend.dev) can only deliver to the Resend account's own
 * email — every other recipient silently fails to send. Verify a domain and
 * set RESEND_FROM_EMAIL once real delivery to org members matters.
 */
export async function sendEmail(opts: {
	to: string[];
	subject: string;
	html: string;
	replyTo?: string;
}): Promise<void> {
	if (opts.to.length === 0) return;
	const resend = getResendClient();
	const { error } = await resend.emails.send({
		from: process.env.RESEND_FROM_EMAIL || "Vitalgate <onboarding@resend.dev>",
		to: opts.to,
		subject: opts.subject,
		html: opts.html,
		replyTo: opts.replyTo,
	});
	if (error) throw new Error(`Resend: ${error.message}`);
}
