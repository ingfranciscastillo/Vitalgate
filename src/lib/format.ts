export function timeAgo(iso: string | Date | null): string {
	if (!iso) return "never";
	const ms = Date.now() - new Date(iso).getTime();
	const hours = Math.floor(ms / 3_600_000);
	if (hours < 1) return "just now";
	if (hours < 24) return `${hours}h ago`;
	const days = Math.floor(hours / 24);
	return `${days}d ago`;
}

const CHANNEL_LABEL = {
	email: "Email",
	slack: "Slack",
	discord: "Discord",
	webhook: "Webhook",
};

/** "Email, Slack" — or "Not delivered" when an alert reached no channel. */
export function formatDelivery(
	deliveredTo: readonly (keyof typeof CHANNEL_LABEL)[],
): string {
	return deliveredTo.length === 0
		? "Not delivered"
		: deliveredTo.map((c) => CHANNEL_LABEL[c]).join(", ");
}
