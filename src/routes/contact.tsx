import { useMutation } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import toast from "react-hot-toast";
import { MarketingShell } from "@/components/marketing-shell";
import { Reveal } from "@/components/reveal";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CONTACT_LIMITS, sendContactMessage } from "@/lib/contact.functions";
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

function Contact() {
	const [name, setName] = useState("");
	const [email, setEmail] = useState("");
	const [message, setMessage] = useState("");
	const [website, setWebsite] = useState("");

	const sendMutation = useMutation({
		mutationFn: sendContactMessage,
		onSuccess: () => {
			toast.success("Message sent — we'll get back to you soon.");
			setName("");
			setEmail("");
			setMessage("");
		},
		onError: (error) => {
			toast.error(
				error instanceof Error ? error.message : "Could not send your message",
			);
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
							className="grid gap-4"
							onSubmit={(e) => {
								e.preventDefault();
								sendMutation.mutate({
									data: { name, email, message, website },
								});
							}}
						>
							<div className="grid gap-4 sm:grid-cols-2">
								<div className="space-y-1.5">
									<Label htmlFor="contact-name">Name</Label>
									<Input
										id="contact-name"
										value={name}
										onChange={(e) => setName(e.target.value)}
										maxLength={CONTACT_LIMITS.name}
										required
									/>
								</div>
								<div className="space-y-1.5">
									<Label htmlFor="contact-email">Email</Label>
									<Input
										id="contact-email"
										type="email"
										value={email}
										onChange={(e) => setEmail(e.target.value)}
										maxLength={CONTACT_LIMITS.email}
										required
									/>
								</div>
							</div>
							<div className="space-y-1.5">
								<Label htmlFor="contact-message">Message</Label>
								<Textarea
									id="contact-message"
									rows={5}
									value={message}
									onChange={(e) => setMessage(e.target.value)}
									maxLength={CONTACT_LIMITS.message}
									required
								/>
							</div>
							{/* Honeypot: off-screen and skipped by keyboard and screen
							    readers, so only bots fill it in. */}
							<div
								aria-hidden="true"
								className="absolute -left-[9999px] h-0 w-0 overflow-hidden"
							>
								<label htmlFor="contact-website">Website</label>
								<input
									id="contact-website"
									name="website"
									type="text"
									tabIndex={-1}
									autoComplete="off"
									value={website}
									onChange={(e) => setWebsite(e.target.value)}
								/>
							</div>
							<Button
								type="submit"
								className="justify-self-start"
								disabled={sendMutation.isPending}
							>
								{sendMutation.isPending ? "Sending…" : "Send message"}
							</Button>
						</form>
					</Card>
				</Reveal>
			</section>
		</MarketingShell>
	);
}
