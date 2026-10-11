import { getAppUrl } from "@/lib/app-url.server";
import type { IntegrationProvider } from "@/lib/mock-data";
import { verifyOAuthState } from "@/lib/oauth-state.server";

function redirect(url: string) {
	return new Response(null, { status: 302, headers: { location: url } });
}

/**
 * Shared OAuth-callback flow for every OAuth integration: verify state, let
 * `connect` exchange the code and store the connection, and always land
 * back on Settings with a query param the UI reads to toast success or
 * failure (?integration=<provider>&status=connected|error&reason=...).
 */
export async function handleIntegrationCallback(
	request: Request,
	provider: IntegrationProvider,
	connect: (code: string, organizationId: string) => Promise<void>,
): Promise<Response> {
	const url = new URL(request.url);
	const appUrl = getAppUrl();
	const settingsUrl = `${appUrl}/settings`;

	const oauthError = url.searchParams.get("error");
	if (oauthError) {
		return redirect(
			`${settingsUrl}?integration=${provider}&status=error&reason=${encodeURIComponent(oauthError)}`,
		);
	}

	const code = url.searchParams.get("code");
	const state = url.searchParams.get("state");
	if (!code || !state) {
		return redirect(
			`${settingsUrl}?integration=${provider}&status=error&reason=missing_params`,
		);
	}

	const organizationId = verifyOAuthState(state);
	if (!organizationId) {
		return redirect(
			`${settingsUrl}?integration=${provider}&status=error&reason=invalid_state`,
		);
	}

	try {
		await connect(code, organizationId);
		return redirect(`${settingsUrl}?integration=${provider}&status=connected`);
	} catch (err) {
		const reason = err instanceof Error ? err.message : "unknown";
		return redirect(
			`${settingsUrl}?integration=${provider}&status=error&reason=${encodeURIComponent(reason)}`,
		);
	}
}
