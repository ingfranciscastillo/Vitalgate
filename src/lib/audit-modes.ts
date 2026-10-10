export type AuditMode = "build" | "preview";

/** The two ways a repository's pull requests can be audited, as shown on the connect page and in a repo's Settings. */
export const AUDIT_MODES: readonly {
	id: AuditMode;
	label: string;
	desc: string;
}[] = [
	{
		id: "preview",
		label: "Preview deployments",
		desc: "Audits the preview your host (Vercel, Netlify, Render…) deploys for each pull request. Faster, and no secrets needed.",
	},
	{
		id: "build",
		label: "Build in GitHub Actions",
		desc: "Builds and starts the app in the workflow, then audits it on localhost.",
	},
];
