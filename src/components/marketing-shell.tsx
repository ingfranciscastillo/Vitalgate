import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { linkUnderline } from "@/lib/link-hover";
import { Logo } from "./logo";
import { ThemeToggle } from "./theme-toggle";

export function MarketingShell({ children }: { children: ReactNode }) {
	return (
		<div className="flex min-h-screen flex-col bg-background text-foreground">
			<header className="sticky top-0 z-30 border-b border-border bg-background">
				<div className="mx-auto flex h-16 max-w-6xl items-center px-5">
					<Link to="/">
						<Logo />
					</Link>
					<nav className="ml-10 hidden items-center gap-7 text-sm text-muted-foreground md:flex">
						<a href="/#features" className={linkUnderline}>
							Features
						</a>
						<a href="/#how" className={linkUnderline}>
							How it works
						</a>
						<Link to="/pricing" className={linkUnderline}>
							Pricing
						</Link>
						<Link to="/tools/core-web-vitals" className={linkUnderline}>
							Web Vitals checker
						</Link>
						<a href="/#faq" className={linkUnderline}>
							FAQ
						</a>
						<Link to="/contact" className={linkUnderline}>
							Contact
						</Link>
					</nav>
					<div className="ml-auto flex items-center gap-2">
						<ThemeToggle />
						<Link to="/login" className="hidden sm:inline-flex">
							<Button variant="ghost" size="sm">
								Sign in
							</Button>
						</Link>
						<Link to="/login">
							<Button
								size="sm"
								className="bg-brand text-brand-foreground hover:bg-brand/90"
							>
								Connect a repo
							</Button>
						</Link>
					</div>
				</div>
			</header>
			<main className="flex-1">{children}</main>
			<footer className="border-t border-border">
				<div className="mx-auto flex max-w-6xl flex-col gap-8 px-5 py-12 md:flex-row md:items-start">
					<div className="max-w-xs">
						<Logo />
						<p className="mt-3 text-sm text-muted-foreground">
							Performance budgets enforced on every pull request, before a
							regression ever reaches production.
						</p>
					</div>
					<div className="grid flex-1 grid-cols-2 gap-8 text-sm sm:grid-cols-3 md:ml-auto">
						<div>
							<div className="text-xs uppercase tracking-wider text-muted-foreground">
								Product
							</div>
							<div className="mt-3 flex flex-col items-start gap-2">
								<a
									href="/#features"
									className={`${linkUnderline} text-foreground/80`}
								>
									Features
								</a>
								<Link
									to="/pricing"
									className={`${linkUnderline} text-foreground/80`}
								>
									Pricing
								</Link>
								<Link
									to="/tools/core-web-vitals"
									className={`${linkUnderline} text-foreground/80`}
								>
									Core Web Vitals checker
								</Link>
								<Link
									to="/login"
									className={`${linkUnderline} text-foreground/80`}
								>
									Connect a repo
								</Link>
							</div>
						</div>
						<div>
							<div className="text-xs uppercase tracking-wider text-muted-foreground">
								Company
							</div>
							<div className="mt-3 flex flex-col items-start gap-2">
								<Link
									to="/contact"
									className={`${linkUnderline} text-foreground/80`}
								>
									Contact
								</Link>
							</div>
						</div>
						<div>
							<div className="text-xs uppercase tracking-wider text-muted-foreground">
								Legal
							</div>
							<div className="mt-3 flex flex-col items-start gap-2">
								<Link
									to="/privacy-policy"
									className={`${linkUnderline} text-foreground/80`}
								>
									Privacy
								</Link>
								<Link
									to="/terms"
									className={`${linkUnderline} text-foreground/80`}
								>
									Terms
								</Link>
							</div>
						</div>
					</div>
				</div>
				<div className="border-t border-border">
					<div className="mx-auto max-w-6xl px-5 py-4 font-mono text-xs text-muted-foreground">
						© {new Date().getFullYear()} Vitalgate
					</div>
				</div>
			</footer>
		</div>
	);
}
