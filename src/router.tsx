import { createRouter as createTanStackRouter } from "@tanstack/react-router";
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";
import { RoutePending } from "./components/route-pending";
import { ErrorPage, NotFoundPage } from "./components/route-status";
import { getContext } from "./integrations/tanstack-query/root-provider";
import { routeTree } from "./routeTree.gen";

export function getRouter() {
	const context = getContext();

	const router = createTanStackRouter({
		routeTree,
		context,
		scrollRestoration: true,
		defaultPreload: "intent",
		defaultPreloadStaleTime: 0,
		defaultErrorComponent: ErrorPage,
		// Slow loaders show the Vitalgate loader, but only past 200ms (fast
		// navigations never flash it) and then for at least 500ms.
		defaultPendingComponent: RoutePending,
		defaultPendingMs: 200,
		defaultPendingMinMs: 500,
		defaultNotFoundComponent: NotFoundPage,
	});

	setupRouterSsrQueryIntegration({ router, queryClient: context.queryClient });

	return router;
}

declare module "@tanstack/react-router" {
	interface Register {
		router: ReturnType<typeof getRouter>;
	}
}
