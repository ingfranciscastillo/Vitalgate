import { TanStackDevtools } from "@tanstack/react-devtools";
import type { QueryClient } from "@tanstack/react-query";
import {
	createRootRouteWithContext,
	HeadContent,
	Scripts,
} from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";
import { Toaster } from "react-hot-toast";

import { ThemeProvider } from "../components/theme-provider";
import TanStackQueryDevtools from "../integrations/tanstack-query/devtools";
import appCss from "../styles.css?url";

interface MyRouterContext {
	queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<MyRouterContext>()({
	head: () => ({
		meta: [
			{
				charSet: "utf-8",
			},
			{
				name: "viewport",
				content: "width=device-width, initial-scale=1",
			},
			{
				// Every page-rendering route sets its own title, so this only
				// shows up if one is ever added without one — better a real
				// brand name than the framework starter's leftover default.
				title: "Vitalgate",
			},
		],
		links: [
			{
				rel: "stylesheet",
				href: appCss,
			},
			// SVG-only — no PNG/ICO fallback exists yet, so pre-Chromium Safari
			// and other browsers without SVG favicon support fall back to no
			// icon rather than a broken one. Add a rasterized apple-touch-icon
			// (PNG, 180x180) alongside this once real brand assets exist.
			{ rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
		],
	}),
	shellComponent: RootDocument,
});

function RootDocument({ children }: { children: React.ReactNode }) {
	return (
		<html lang="en">
			<head>
				<HeadContent />
				<script
					// biome-ignore lint/security/noDangerouslySetInnerHtml: inline theme-flash guard must run before hydration
					dangerouslySetInnerHTML={{
						__html: `(function(){try{var t=localStorage.getItem('pbt-theme');if(!t){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}if(t==='dark')document.documentElement.classList.add('dark')}catch(e){}})();`,
					}}
				/>
			</head>
			<body>
				<ThemeProvider>{children}</ThemeProvider>
				<Toaster
					position="bottom-right"
					toastOptions={{
						style: {
							background: "var(--color-card)",
							color: "var(--color-card-foreground)",
							border: "1px solid var(--color-border)",
							fontSize: "13px",
						},
						success: {
							iconTheme: {
								primary: "var(--color-success)",
								secondary: "var(--color-success-foreground)",
							},
						},
						error: {
							iconTheme: {
								primary: "var(--color-destructive)",
								secondary: "var(--color-destructive-foreground)",
							},
						},
					}}
				/>
				<TanStackDevtools
					config={{
						position: "bottom-right",
					}}
					plugins={[
						{
							name: "Tanstack Router",
							render: <TanStackRouterDevtoolsPanel />,
						},
						TanStackQueryDevtools,
					]}
				/>
				<Scripts />
			</body>
		</html>
	);
}
