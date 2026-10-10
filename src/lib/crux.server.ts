import {
	CRUX_METRIC_NAMES,
	type CruxFormFactor,
	type CruxSnapshot,
	parseCruxHistory,
	parseCruxRecord,
} from "@/lib/crux";

const API = "https://chromeuxreport.googleapis.com/v1/records";

/** Whether CRUX_API_KEY is set — without it the repo page explains how to enable real-user metrics. */
export function isCruxConfigured(): boolean {
	return Boolean(process.env.CRUX_API_KEY);
}

async function query(endpoint: string, body: object): Promise<Response> {
	return fetch(`${API}:${endpoint}?key=${process.env.CRUX_API_KEY}`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(body),
		signal: AbortSignal.timeout(8000),
	});
}

/**
 * The Chrome UX Report for an origin, across all devices unless a
 * `formFactor` is given: the current p75s
 * plus their weekly history. Null when CrUX has no data for it — the site
 * doesn't get enough Chrome traffic, or isn't public. Throws on any other
 * failure (bad key, quota, network) so the caller doesn't cache it.
 */
export async function fetchCruxSnapshot(
	origin: string,
	formFactor?: CruxFormFactor,
): Promise<CruxSnapshot | null> {
	const metrics = Object.values(CRUX_METRIC_NAMES);
	const [current, history] = await Promise.all([
		query("queryRecord", { origin, formFactor, metrics }),
		query("queryHistoryRecord", {
			origin,
			formFactor,
			metrics: [
				CRUX_METRIC_NAMES.INP,
				CRUX_METRIC_NAMES.LCP,
				CRUX_METRIC_NAMES.CLS,
			],
			collectionPeriodCount: 25,
		}).catch(() => null),
	]);

	if (current.status === 404) return null;
	if (!current.ok) {
		throw new Error(`Chrome UX Report responded ${current.status}`);
	}
	const record = parseCruxRecord(await current.json());
	if (!record) return null;

	// The trend is a nice-to-have: the current numbers stand on their own.
	const points =
		history?.ok === true
			? parseCruxHistory(await history.json().catch(() => null))
			: [];

	return { ...record, history: points };
}
