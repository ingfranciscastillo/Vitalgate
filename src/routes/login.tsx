import {
	ArrowLeftIcon,
	CheckCircleIcon,
	GithubLogoIcon,
	WarningCircleIcon,
} from "@phosphor-icons/react";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import { Logo } from "@/components/logo";
import { PrCommentPreview } from "@/components/pr-comment-preview";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { getSession } from "@/lib/auth.functions";
import { authClient } from "@/lib/auth-client";
import { linkUnderline } from "@/lib/link-hover";
import { EASE_OUT, staggerContainer, staggerItem } from "@/lib/motion";
import { OG_IMAGE_META, SITE_URL } from "@/lib/seo";

/**
 * Where to go after signing in, e.g. /accept-invitation/abc when an
 * invitation link sent a signed-out visitor here. Only same-site paths are
 * accepted — "//evil.com" or "https://..." would make this an open redirect.
 */
function safeRedirect(value: unknown): string | undefined {
	return typeof value === "string" &&
		value.startsWith("/") &&
		!value.startsWith("//") &&
		!value.startsWith("/\\")
		? value
		: undefined;
}

export const Route = createFileRoute("/login")({
	validateSearch: (search): { redirect?: string } => ({
		redirect: safeRedirect(search.redirect),
	}),
	// Signing in again while already signed in should just land where the
	// visitor was headed, not show the sign-in screen a second time.
	beforeLoad: async ({ search }) => {
		const session = await getSession();
		if (session) {
			throw redirect({ href: search.redirect ?? "/dashboard" });
		}
	},
	head: () => ({
		meta: [
			{ title: "Sign in: Vitalgate" },
			{
				name: "description",
				content:
					"Sign in to Vitalgate with GitHub to monitor performance budgets on every PR.",
			},
			{ property: "og:url", content: `${SITE_URL}/login` },
			{ property: "og:title", content: "Sign in: Vitalgate" },
			{
				property: "og:description",
				content:
					"Sign in with GitHub to keep performance budgets enforced on every pull request.",
			},
			...OG_IMAGE_META,
			{ name: "twitter:card", content: "summary_large_image" },
		],
		links: [{ rel: "canonical", href: `${SITE_URL}/login` }],
	}),
	component: Login,
});

function Login() {
	const reduce = useReducedMotion();
	const item = staggerItem(reduce);
	const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
	const { redirect: redirectTo } = Route.useSearch();

	const handleSignIn = async () => {
		setStatus("loading");
		const { error } = await authClient.signIn.social({
			provider: "github",
			callbackURL: redirectTo ?? "/dashboard",
			// First sign-in: straight to connecting a repo, the step that gets
			// them to a first audited PR, unless they came for something
			// specific (an invitation link).
			newUserCallbackURL: redirectTo ?? "/repositories/new",
		});
		if (error) setStatus("error");
	};

	return (
		<div className="grid min-h-screen bg-background text-foreground md:grid-cols-2">
			<motion.aside
				initial="hidden"
				animate="show"
				variants={staggerContainer}
				className="hidden flex-col justify-between border-r border-border bg-muted/30 p-10 md:flex"
			>
				<motion.div variants={item}>
					<Link
						to="/"
						className={`inline-flex items-center gap-2 text-sm text-muted-foreground ${linkUnderline}`}
					>
						<ArrowLeftIcon className="h-4 w-4" /> Back to home
					</Link>
				</motion.div>

				<motion.div
					variants={item}
					className="flex flex-1 items-center justify-center py-10"
				>
					<div className="w-full max-w-xl">
						<PrCommentPreview />
					</div>
				</motion.div>

				<motion.p
					variants={item}
					className="max-w-md text-sm leading-relaxed text-muted-foreground"
				>
					Lighthouse runs on your own GitHub Actions runner or against your
					preview deployment. Only the resulting metrics are sent back to
					Vitalgate and checked against your budgets.
				</motion.p>
			</motion.aside>

			<section className="relative flex flex-col px-6 py-8 sm:px-10">
				<div className="flex items-center justify-between">
					<Link to="/">
						<Logo />
					</Link>
					<ThemeToggle />
				</div>

				<div className="flex flex-1 items-center">
					<motion.div
						initial="hidden"
						animate="show"
						variants={staggerContainer}
						className="mx-auto w-full max-w-sm"
					>
						<motion.h1
							variants={item}
							className="text-3xl font-extrabold tracking-tight sm:text-4xl"
						>
							Get started with Vitalgate
						</motion.h1>
						<motion.p
							variants={item}
							className="mt-3 text-sm leading-relaxed text-muted-foreground"
						>
							One GitHub sign-in, whether you're new or coming back. Free for
							one repository, no credit card.
						</motion.p>

						<motion.div variants={item}>
							<Button
								className="mt-8 w-full bg-foreground text-background hover:bg-foreground/90"
								size="lg"
								loading={status === "loading"}
								onClick={handleSignIn}
							>
								{status === "loading" ? (
									"Redirecting to GitHub…"
								) : (
									<>
										<GithubLogoIcon className="h-4 w-4" weight="fill" />
										Continue with GitHub
									</>
								)}
							</Button>
							<AnimatePresence>
								{status === "error" && (
									<motion.p
										initial={reduce ? false : { opacity: 0, y: -4 }}
										animate={{ opacity: 1, y: 0 }}
										exit={reduce ? undefined : { opacity: 0, y: -4 }}
										transition={{ duration: 0.2, ease: EASE_OUT }}
										className="mt-3 flex items-center gap-1.5 text-xs text-destructive"
									>
										<WarningCircleIcon className="h-3.5 w-3.5 shrink-0" />
										Couldn't reach GitHub. Check your connection and try again.
									</motion.p>
								)}
							</AnimatePresence>
						</motion.div>

						<motion.ul
							variants={item}
							className="mt-6 space-y-2 text-xs text-muted-foreground"
						>
							<li className="flex items-center gap-2">
								<CheckCircleIcon className="h-3.5 w-3.5 text-primary" /> Only
								your GitHub name, email and organizations
							</li>
							<li className="flex items-center gap-2">
								<CheckCircleIcon className="h-3.5 w-3.5 text-primary" /> Repo
								access comes later, only on repos you pick
							</li>
							<li className="flex items-center gap-2">
								<CheckCircleIcon className="h-3.5 w-3.5 text-primary" /> Revoke
								anytime from GitHub settings
							</li>
						</motion.ul>

						<motion.div
							variants={item}
							className="mt-10 text-xs text-muted-foreground"
						>
							By continuing you agree to our{" "}
							<Link to="/terms" className={linkUnderline}>
								Terms of Service
							</Link>{" "}
							and{" "}
							<Link to="/privacy-policy" className={linkUnderline}>
								Privacy Policy
							</Link>
							.
						</motion.div>
					</motion.div>
				</div>

				<div className="font-mono text-xs text-muted-foreground">
					© {new Date().getFullYear()} Vitalgate
				</div>
			</section>
		</div>
	);
}
