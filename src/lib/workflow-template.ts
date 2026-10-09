import type { PackageManager } from "@/lib/github";
import { WORKFLOW_MANAGED_MARKER } from "@/lib/github";
import { PR_COMMENT_MARKER } from "@/lib/pr-comment";

/**
 * Per-manager setup/install YAML block. Deliberately no hardcoded tool
 * versions: pnpm/setup reads the exact pnpm version from the repo's own
 * package.json ("packageManager" field) so it always matches whatever
 * generated the lockfile, and "lts/*" tracks whichever Node LTS is current
 * instead of going stale the moment a specific number is deprecated.
 */
function setupAndInstall(
	manager: PackageManager,
	pnpmVersion: string,
	yarn: { isBerry: boolean; version?: string },
): string {
	switch (manager) {
		case "pnpm":
			// pnpm/setup installs Node + pnpm and runs `pnpm install` itself, so
			// there's no separate "Install dependencies" step to keep in sync.
			// No explicit frozen-lockfile flag needed: pnpm already defaults to
			// --frozen-lockfile behavior whenever the CI env var is set, which
			// GitHub Actions always sets.
			//
			// `version` is required — pnpm/setup only reads it from package.json's
			// "packageManager" field, and errors ("No pnpm version is specified")
			// on any repo that doesn't declare one, which most don't.
			return `      - uses: pnpm/setup@v2
        with:
          version: ${pnpmVersion}
          cache: true`;
		case "yarn": {
			// Yarn Classic (v1) and Berry (v2+) are mutually incompatible: they
			// don't share a lockfile format or a "frozen install" flag
			// (--frozen-lockfile vs --immutable). Without an explicit pin,
			// Corepack always falls back to Classic — wrong whenever the
			// lockfile is actually Berry's format, so that case gets an
			// explicit activate step; Classic needs no such step since
			// Corepack's own fallback already matches it.
			const activateStep = yarn.isBerry
				? `\n\n      - name: Activate Yarn Berry
        run: corepack prepare yarn@${yarn.version ?? "stable"} --activate`
				: "";
			const installFlag = yarn.isBerry ? "--immutable" : "--frozen-lockfile";
			return `      - uses: actions/setup-node@v7
        with:
          node-version: lts/*
          cache: yarn

      - name: Enable Corepack
        run: corepack enable${activateStep}

      - name: Install dependencies
        run: yarn install ${installFlag}`;
		}
		case "npm":
			return `      - uses: actions/setup-node@v7
        with:
          node-version: lts/*
          cache: npm

      - name: Install dependencies
        run: npm ci`;
	}
}

function runScript(manager: PackageManager, script: string): string {
	switch (manager) {
		case "pnpm":
			return `pnpm run ${script}`;
		case "yarn":
			return `yarn ${script}`;
		case "npm":
			return `npm run ${script}`;
	}
}

/**
 * GitHub Action template committed to a repo when it's connected. Every
 * value below — package manager, its version, the serve script, the port,
 * and where to report results — is resolved once at connect time from the
 * repo's own files and the request that connected it, instead of guessed
 * defaults baked into the template. Re-running "detect" only happens by
 * disconnecting and reconnecting the repo on Vitalgate, which regenerates
 * this whole file (see WORKFLOW_MANAGED_MARKER).
 */
export function vitalgateWorkflowYaml(opts: {
	defaultBranch: string;
	githubRepoId: string;
	packageManager: PackageManager;
	/**
	 * Exact pnpm version to install (ignored for yarn/npm). Pass the version
	 * from package.json's "packageManager" field when the repo declares one, to
	 * match whatever generated its lockfile — otherwise "latest" (an npm
	 * dist-tag pnpm/setup resolves itself, so it stays current with no
	 * hardcoded number to go stale).
	 */
	pnpmVersion: string;
	/**
	 * Whether the repo's yarn.lock is Berry's format (v2+) rather than
	 * Classic's (v1) — ignored for pnpm/npm. Determines both the install flag
	 * (--immutable vs --frozen-lockfile) and whether an explicit Corepack
	 * activation step is needed (Corepack's un-pinned default is always
	 * Classic, which can't install a Berry lockfile).
	 */
	yarnIsBerry: boolean;
	/** Exact yarn version from package.json's "packageManager" field, if pinned. Ignored for pnpm/npm. */
	yarnVersion?: string;
	/** package.json script name that serves the production build (e.g. "start", "preview"). */
	startScript: string;
	/** Port the serve script listens on once started. */
	port: number;
	/**
	 * Names (never values) of repo secrets to forward to the started server,
	 * e.g. ["DATABASE_URL", "GROQ_API_KEY"] — for repos whose production
	 * server needs more than a port to boot without erroring on every
	 * request. Each becomes a `secrets.<NAME>` reference in the generated
	 * workflow; Vitalgate never sees or stores the actual value.
	 */
	envVarNames: string[];
	/** Origin Vitalgate is reachable at, e.g. "https://vitalgate.example.com" — no trailing slash. */
	vitalgateOrigin: string;
}): string {
	const forwardedEnv = opts.envVarNames
		.map((name) => `          ${name}: \${{ secrets.${name} }}\n`)
		.join("");
	return `${WORKFLOW_MANAGED_MARKER} Reconnecting this repository on Vitalgate regenerates this file — edits made directly here will be overwritten.
name: Vitalgate Performance Budgets

on:
  pull_request:
    branches: ["${opts.defaultBranch}"]

env:
  VITALGATE_PORT: ${opts.port}

jobs:
  lighthouse:
    runs-on: ubuntu-latest
    # Only what the job needs: read the code, and comment the results on the
    # pull request with the workflow's own GITHUB_TOKEN.
    permissions:
      contents: read
      pull-requests: write
    # Bounds the whole job so a hung dev server (or anything else) fails loudly
    # instead of running until someone notices and cancels it by hand.
    timeout-minutes: 20
    steps:
      - uses: actions/checkout@v7

${setupAndInstall(opts.packageManager, opts.pnpmVersion, {
	isBerry: opts.yarnIsBerry,
	version: opts.yarnVersion,
})}

      - name: Build
        run: ${runScript(opts.packageManager, "build")}

      - name: Start server in background
        env:
          PORT: \${{ env.VITALGATE_PORT }}
${forwardedEnv}        run: |
          ${runScript(opts.packageManager, opts.startScript)} &
          npx --yes wait-on -v "http://localhost:\${{ env.VITALGATE_PORT }}" --timeout 180000 --interval 2000 --httpTimeout 10000

      - name: Run Lighthouse
        timeout-minutes: 5
        run: npx --yes lighthouse "http://localhost:\${{ env.VITALGATE_PORT }}" --output=json --output-path=./lighthouse.json --chrome-flags="--headless --no-sandbox" --max-wait-for-load=45000

      - name: Report to Vitalgate
        env:
          VITALGATE_TOKEN: \${{ secrets.VITALGATE_TOKEN }}
          PR_NUMBER: \${{ github.event.pull_request.number }}
          PR_TITLE: \${{ github.event.pull_request.title }}
          PR_AUTHOR: \${{ github.event.pull_request.user.login }}
          PR_BRANCH: \${{ github.event.pull_request.head.ref }}
          GITHUB_TOKEN: \${{ secrets.GITHUB_TOKEN }}
        run: |
          node -e '
          const fs = require("fs");
          const report = JSON.parse(fs.readFileSync("./lighthouse.json", "utf8"));
          const a = report.audits;
          const metrics = {
            LCP: a["largest-contentful-paint"].numericValue,
            CLS: a["cumulative-layout-shift"].numericValue,
            FCP: a["first-contentful-paint"].numericValue,
            TBT: a["total-blocking-time"].numericValue,
            PERF: Math.round(report.categories.performance.score * 100),
          };
          // Lighthouse (lab data) has no INP audit — INP is a field metric,
          // not something a single synthetic run produces. Left out on purpose.

          // Posts the results on the PR, or updates the previous Vitalgate
          // comment so a PR has one comment instead of one per push. Never
          // fails the job: PRs from forks get a read-only token and can not
          // be commented on.
          async function upsertComment(markdown) {
            if (!markdown || !process.env.GITHUB_TOKEN) return;
            const api = "https://api.github.com/repos/" + process.env.GITHUB_REPOSITORY + "/issues";
            const headers = {
              authorization: "Bearer " + process.env.GITHUB_TOKEN,
              accept: "application/vnd.github+json",
              "content-type": "application/json",
              "x-github-api-version": "2022-11-28",
            };
            try {
              const list = await fetch(api + "/" + process.env.PR_NUMBER + "/comments?per_page=100", { headers }).then((r) => r.json());
              const previous = Array.isArray(list)
                ? list.find((c) => c.user && c.user.login === "github-actions[bot]" && c.body && c.body.includes("${PR_COMMENT_MARKER}"))
                : undefined;
              const res = previous
                ? await fetch(api + "/comments/" + previous.id, { method: "PATCH", headers, body: JSON.stringify({ body: markdown }) })
                : await fetch(api + "/" + process.env.PR_NUMBER + "/comments", { method: "POST", headers, body: JSON.stringify({ body: markdown }) });
              if (!res.ok) console.log("Vitalgate: could not comment on the PR (HTTP " + res.status + ").");
            } catch (err) {
              console.log("Vitalgate: could not comment on the PR: " + err.message);
            }
          }

          (async () => {
            const res = await fetch("${opts.vitalgateOrigin}/api/ingest", {
              method: "POST",
              headers: {
                "content-type": "application/json",
                authorization: "Bearer " + process.env.VITALGATE_TOKEN,
              },
              body: JSON.stringify({
                githubRepoId: "${opts.githubRepoId}",
                prNumber: Number(process.env.PR_NUMBER),
                prTitle: process.env.PR_TITLE,
                prAuthor: process.env.PR_AUTHOR,
                branch: process.env.PR_BRANCH,
                metrics,
              }),
            });
            const body = await res.json();
            if (!res.ok) {
              console.error(JSON.stringify(body, null, 2));
              process.exit(1);
            }
            console.log(JSON.stringify({ status: body.status, violations: body.violations }, null, 2));
            await upsertComment(body.comment);
            if (body.status === "failing") {
              console.error("Vitalgate: a required performance budget was violated.");
              process.exit(1);
            }
          })();
          '

# Setup checklist:
# 1. Add a repo secret named VITALGATE_TOKEN (Settings > Secrets and
#    variables > Actions) with the token from Vitalgate's Settings page.
# 2. Package manager (${opts.packageManager}${opts.packageManager === "pnpm" ? ` ${opts.pnpmVersion}` : ""}),
#    serve script ("${opts.startScript}"), and port (${opts.port}) were detected
#    from this repo at connect time. Wrong? Disconnect and reconnect the repo
#    on Vitalgate (or type an override when connecting) to regenerate this
#    file — don't edit the values above by hand, they'll be overwritten on
#    the next reconnect.${
		opts.envVarNames.length > 0
			? `
# 3. Forwards these repo secrets to the started server: ${opts.envVarNames.join(", ")}.
#    Add/remove which ones by editing "Environment variables" when
#    reconnecting this repo on Vitalgate — the values themselves stay in
#    this repo's own secrets, Vitalgate only stores the names.`
			: ""
	}
`;
}
