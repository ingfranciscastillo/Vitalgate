import { type AnyFieldApi, useForm } from "@tanstack/react-form";
import { createFileRoute } from "@tanstack/react-router";
import toast from "react-hot-toast";
import { MarketingShell } from "@/components/marketing-shell";
import { Reveal } from "@/components/reveal";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { sendContactMessage } from "@/lib/contact.functions";
import {
	CONTACT_LIMITS,
	type ContactValues,
	contactSchema,
} from "@/lib/contact-schema";
import { OG_IMAGE_META, SITE_URL } from "@/lib/seo";

export const Route = createFileRoute("/contact")({
	head: () => ({
		meta: [
			{ title: "Contact: Vitalgate" },
			{
				name: "description",
				content: "Questions about Vitalgate? Send us a message.",
			},
			{ property: "og:type", content: "website" },
			{ property: "og:url", content: `${SITE_URL}/contact` },
			{ property: "og:title", content: "Contact Vitalgate" },
			...OG_IMAGE_META,
			{ name: "twitter:card", content: "summary_large_image" },
		],
		links: [{ rel: "canonical", href: `${SITE_URL}/contact` }],
	}),
	component: Contact,
});

const EMPTY_FORM: ContactValues = {
	name: "",
	email: "",
	message: "",
	website: "",
};

function Contact() {
	const form = useForm({
		defaultValues: EMPTY_FORM,
		// The same schema the server validates against, re-run on every change
		// (and on submit). Deliberately not an onSubmit validator: its errors
		// are only recomputed by the next submit, which they themselves block
		// via canSubmit, so a corrected form could never be sent again.
		validators: { onChange: contactSchema },
		onSubmit: async ({ value, formApi }) => {
			try {
				await sendContactMessage({ data: value });
				toast.success("Message sent — we'll get back to you soon.");
				formApi.reset();
			} catch (error) {
				toast.error(
					error instanceof Error
						? error.message
						: "Could not send your message",
				);
			}
		},
	});

	return (
		<MarketingShell>
			<section className="mx-auto max-w-2xl px-5 py-24">
				<Reveal className="text-center">
					<span className="text-xs uppercase tracking-wider text-primary">
						Contact
					</span>
					<h1 className="mt-2 text-3xl font-extrabold tracking-tight sm:text-4xl">
						Questions before you connect a repo?
					</h1>
					<p className="mt-4 text-muted-foreground">
						Send us a message and we'll get back to you.
					</p>
				</Reveal>
				<Reveal delay={0.08}>
					<Card className="mt-10 p-6">
						<form
							noValidate
							className="relative grid gap-4"
							onSubmit={(e) => {
								e.preventDefault();
								e.stopPropagation();
								form.handleSubmit();
							}}
						>
							<div className="grid gap-4 sm:grid-cols-2">
								<form.Field name="name">
									{(field) => (
										<div className="space-y-1.5">
											<Label htmlFor="contact-name">Name</Label>
											<Input
												id="contact-name"
												name={field.name}
												autoComplete="name"
												value={field.state.value}
												onBlur={field.handleBlur}
												onChange={(e) => field.handleChange(e.target.value)}
												maxLength={CONTACT_LIMITS.name}
												{...errorProps(field, "contact-name-error")}
											/>
											<FieldError field={field} id="contact-name-error" />
										</div>
									)}
								</form.Field>
								<form.Field name="email">
									{(field) => (
										<div className="space-y-1.5">
											<Label htmlFor="contact-email">Email</Label>
											<Input
												id="contact-email"
												name={field.name}
												type="email"
												autoComplete="email"
												value={field.state.value}
												onBlur={field.handleBlur}
												onChange={(e) => field.handleChange(e.target.value)}
												maxLength={CONTACT_LIMITS.email}
												{...errorProps(field, "contact-email-error")}
											/>
											<FieldError field={field} id="contact-email-error" />
										</div>
									)}
								</form.Field>
							</div>
							<form.Field name="message">
								{(field) => (
									<div className="space-y-1.5">
										<Label htmlFor="contact-message">Message</Label>
										<Textarea
											id="contact-message"
											name={field.name}
											rows={5}
											value={field.state.value}
											onBlur={field.handleBlur}
											onChange={(e) => field.handleChange(e.target.value)}
											maxLength={CONTACT_LIMITS.message}
											{...errorProps(field, "contact-message-error")}
										/>
										<FieldError field={field} id="contact-message-error" />
									</div>
								)}
							</form.Field>

							{/* Honeypot. Moved off-screen rather than display:none (which
							    some bots skip), and hidden from keyboard, screen
							    readers and autofill, so only a bot fills it in. */}
							<form.Field name="website">
								{(field) => (
									<div
										aria-hidden="true"
										className="pointer-events-none absolute left-[-9999px] top-0 h-px w-px overflow-hidden opacity-0"
									>
										<label htmlFor="contact-website">
											Leave this field empty
										</label>
										<input
											id="contact-website"
											name={field.name}
											type="text"
											tabIndex={-1}
											autoComplete="off"
											data-1p-ignore
											data-lpignore="true"
											value={field.state.value}
											onChange={(e) => field.handleChange(e.target.value)}
										/>
									</div>
								)}
							</form.Field>

							<form.Subscribe selector={(state) => state.isSubmitting}>
								{(isSubmitting) => (
									<Button
										loading={isSubmitting}
										type="submit"
										className="justify-self-start"
										disabled={isSubmitting}
									>
										{isSubmitting ? "Sending…" : "Send message"}
									</Button>
								)}
							</form.Subscribe>
						</form>
					</Card>
				</Reveal>
			</section>
		</MarketingShell>
	);
}

/**
 * First Standard Schema issue for a field — shown once the visitor has left
 * the field or tried to submit, not while they're still typing in it.
 */
function fieldErrorMessage(field: AnyFieldApi): string | undefined {
	const { errors, isBlurred } = field.state.meta;
	const attempted = field.form.state.submissionAttempts > 0;
	if (!(isBlurred || attempted) || errors.length === 0) return undefined;
	const first = errors[0] as { message?: string } | string | undefined;
	return typeof first === "string" ? first : first?.message;
}

function errorProps(field: AnyFieldApi, errorId: string) {
	const invalid = fieldErrorMessage(field) !== undefined;
	return {
		"aria-invalid": invalid || undefined,
		"aria-describedby": invalid ? errorId : undefined,
	};
}

function FieldError({ field, id }: { field: AnyFieldApi; id: string }) {
	const message = fieldErrorMessage(field);
	if (!message) return null;
	return (
		<p id={id} role="alert" className="text-xs text-destructive">
			{message}
		</p>
	);
}
