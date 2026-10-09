import { createFileRoute } from "@tanstack/react-router";
import { getAppUrl } from "@/lib/app-url.server";
import { auth } from "@/lib/auth";
import { linkInstallation } from "@/lib/github-installation.server";
import { verifyOAuthState } from "@/lib/oauth-state.server";

function redirect(url: string) {
	return new Response(null, { status: 302, headers: { location: url } });
}

/**
 * The GitHub App's "Setup URL": GitHub sends the user here after they
 * install the app or change which repos it can access, with
 * ?installation_id=&setup_action=install|update|request&state=.
 * Always lands back on Settings → Integrations with a status to toast.
 */
async function handleSetup(request: Request): Promise<Response> {
	const url = new URL(request.url);
	const appUrl = getAppUrl();
	const done = (status: "connected" | "error", reason?: string) =>
		redirect(
			`${appUrl}/settings?integration=github&status=${status}${reason ? `&reason=${encodeURIComponent(reason)}` : ""}`,
		);

	const session = await auth.api.getSession({ headers: request.headers });
	if (!session) {
		// Come back here, with the same query, once signed in.
		const back = `${url.pathname}${url.search}`;
		return redirect(`${appUrl}/login?redirect=${encodeURIComponent(back)}`);
	}

	const setupAction = url.searchParams.get("setup_action");
	if (setupAction === "request") {
		return done(
			"error",
			"an organization owner has to approve the installation on GitHub first",
		);
	}

	const installationId = url.searchParams.get("installation_id");
	if (!installationId || !/^\d{1,20}$/.test(installationId)) {
		return done("error", "missing installation");
	}

	// Installs started from Vitalgate carry the workspace in a signed state.
	// Changes made later from GitHub's own settings page come back without
	// one; those apply to the workspace the user currently has open.
	const state = url.searchParams.get("state");
	const organizationId = state
		? verifyOAuthState(state)
		: session.session.activeOrganizationId;
	if (!organizationId) {
		return done(
			"error",
			state ? "the link expired, try again" : "no workspace",
		);
	}

	try {
		await linkInstallation({
			userId: session.user.id,
			organizationId,
			installationId,
		});
		return done("connected");
	} catch (err) {
		return done("error", err instanceof Error ? err.message : "unknown error");
	}
}

export const Route = createFileRoute("/api/github/setup")({
	server: {
		handlers: {
			GET: ({ request }) => handleSetup(request),
		},
	},
});
