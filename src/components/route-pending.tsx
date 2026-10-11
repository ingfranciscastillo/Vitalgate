import { useRouterState } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { PageLoader } from "@/components/logo-loader";

/** Sections that live inside the signed-in app shell. */
const APP_SECTIONS = [
	"/dashboard",
	"/repositories",
	"/pulls",
	"/alerts",
	"/team",
	"/settings",
];

/**
 * Shown while a route's loader runs past the router's pending delay: the
 * Vitalgate loader, inside the app shell for app pages so the sidebar and
 * header don't vanish mid-navigation.
 */
export function RoutePending() {
	const pathname = useRouterState({
		select: (s) => s.location.pathname,
	});
	const inApp = APP_SECTIONS.some(
		(p) => pathname === p || pathname.startsWith(`${p}/`),
	);
	return inApp ? (
		<AppShell>
			<PageLoader delay={false} />
		</AppShell>
	) : (
		<PageLoader delay={false} className="min-h-screen" />
	);
}
