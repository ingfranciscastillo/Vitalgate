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

/** First line of every generated workflow: the marker, plus a note for whoever opens the file. */
const HEADER = `${WORKFLOW_MANAGED_MARKER} Vitalgate regenerates this file from this repository's Settings — edits made directly here will be overwritten.`;

/**
 * The "Report to Vitalgate" step, shared by both audit modes: reads
 * ./lighthouse.json, asks GitHub for an OIDC token proving which repository
 * (and PR or deployed commit) this run is for, sends the metrics, and posts
 * the results comment itself only as a fallback (normally the GitHub App
 * posts it). On pull_request runs the PR details come from the event; on
 * deployment runs Vitalgate looks them up from the commit.
 */
function reportStep(vitalgateOrigin: string, mode: "build" | "preview") {
	const prEnv =
		mode === "build"
			? `          PR_NUMBER: \${{ github.event.pull_request.number }}
          PR_TITLE: \${{ github.event.pull_request.title }}
          PR_AUTHOR: \${{ github.event.pull_request.user.login }}
          PR_BRANCH: \${{ github.event.pull_request.head.ref }}
          PR_HEAD_SHA: \${{ github.event.pull_request.head.sha }}
`
			: "";
	return `      - name: Report to Vitalgate
        env:
${prEnv}          GITHUB_TOKEN: \${{ secrets.GITHUB_TOKEN }}
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

          // Fallback only: posts the results on the PR, or updates the
          // previous comment, when the Vitalgate GitHub App could not. Never
          // fails the job: PRs from forks get a read-only token and can not
          // be commented on.
          async function upsertComment(markdown, prNumber) {
            if (!markdown || !prNumber || !process.env.GITHUB_TOKEN) return;
            const api = "https://api.github.com/repos/" + process.env.GITHUB_REPOSITORY + "/issues";
            const headers = {
              authorization: "Bearer " + process.env.GITHUB_TOKEN,
              accept: "application/vnd.github+json",
              "content-type": "application/json",
              "x-github-api-version": "2022-11-28",
            };
            try {
              const list = await fetch(api + "/" + prNumber + "/comments?per_page=100", { headers }).then((r) => r.json());
              const previous = Array.isArray(list)
                ? list.find((c) => c.user && c.user.login === "github-actions[bot]" && c.body && c.body.includes("${PR_COMMENT_MARKER}"))
                : undefined;
              const res = previous
                ? await fetch(api + "/comments/" + previous.id, { method: "PATCH", headers, body: JSON.stringify({ body: markdown }) })
                : await fetch(api + "/" + prNumber + "/comments", { method: "POST", headers, body: JSON.stringify({ body: markdown }) });
              if (!res.ok) console.log("Vitalgate: could not comment on the PR (HTTP " + res.status + ").");
            } catch (err) {
              console.log("Vitalgate: could not comment on the PR: " + err.message);
            }
          }

          (async () => {
            // GitHub withholds OIDC tokens from pull requests opened from
            // forks, so those runs can not report; skip instead of failing.
            if (!process.env.ACTIONS_ID_TOKEN_REQUEST_URL) {
              console.log("Vitalgate: pull requests from forks can not report results, skipping.");
              return;
            }
            const oidc = await fetch(
              process.env.ACTIONS_ID_TOKEN_REQUEST_URL + "&audience=" + encodeURIComponent("${vitalgateOrigin}"),
              { headers: { authorization: "Bearer " + process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN } },
            ).then((r) => r.json());

            const res = await fetch("${vitalgateOrigin}/api/ingest", {
              method: "POST",
              headers: {
                "content-type": "application/json",
                authorization: "Bearer " + oidc.value,
              },
              body: JSON.stringify({
                prTitle: process.env.PR_TITLE,
                prAuthor: process.env.PR_AUTHOR,
                branch: process.env.PR_BRANCH,
                headSha: process.env.PR_HEAD_SHA,
                metrics,
              }),
            });
            const body = await res.json();
            if (!res.ok) {
              console.error(JSON.stringify(body, null, 2));
              process.exit(1);
            }
            if (body.status === "skipped") {
              console.log("Vitalgate: " + body.reason);
              return;
            }
            console.log(JSON.stringify({ status: body.status, violations: body.violations }, null, 2));
            await upsertComment(body.comment, process.env.PR_NUMBER || body.prNumber);
            if (body.status === "failing") {
              console.error("Vitalgate: a required performance budget was violated.");
              // The "Vitalgate" check already reports the failure; only fail
              // this job when that check could not be created.
              if (!body.checkRun) process.exit(1);
            }
          })();
          '
`;
}

/**
 * Workflow for the "build" audit mode: on each pull request, builds the app
 * in GitHub Actions, starts it, and audits it on localhost. Package manager,
 * serve script, port and forwarded secrets are resolved from the repo's own
 * files and its Vitalgate settings when the workflow is (re)generated.
 */
export function vitalgateWorkflowYaml(opts: {
	defaultBranch: string;
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
	return `${HEADER}
name: Vitalgate Performance Budgets

on:
  pull_request:
    branches: ["${opts.defaultBranch}"]

env:
  VITALGATE_PORT: ${opts.port}

jobs:
  lighthouse:
    runs-on: ubuntu-latest
    # Only what the job needs: read the code, comment results on the pull
    # request as a fallback, and ask GitHub for a signed OIDC token that
    # proves to Vitalgate which repository and pull request this is.
    permissions:
      contents: read
      pull-requests: write
      id-token: write
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

${reportStep(opts.vitalgateOrigin, "build")}
# Package manager (${opts.packageManager}${opts.packageManager === "pnpm" ? ` ${opts.pnpmVersion}` : ""}), serve script ("${opts.startScript}")
# and port (${opts.port}) were detected from this repo's files. To change them,
# or the secrets forwarded to the server, use this repository's Settings on
# Vitalgate and regenerate the workflow — edits made here are overwritten.${
		opts.envVarNames.length > 0
			? `
# Forwards these repo secrets to the started server: ${opts.envVarNames.join(", ")}.
# Vitalgate only stores their names; the values stay in this repo's secrets.`
			: ""
	}
`;
}

/**
 * Workflow for the "preview" audit mode: no build here — it runs when the
 * repo's host (Vercel, Netlify, Render…) reports a successful preview
 * deployment to GitHub, and audits that URL. Vitalgate then finds the open
 * pull request whose head is the deployed commit.
 */
export function vitalgatePreviewWorkflowYaml(opts: {
	vitalgateOrigin: string;
}): string {
	return `${HEADER}
name: Vitalgate Performance Budgets

# Audits the preview deployment your host reports to GitHub for each pull
# request, instead of building the app here.
on:
  deployment_status:

jobs:
  lighthouse:
    # Successful, non-production deployments only.
    if: >-
      github.event.deployment_status.state == 'success' &&
      github.event.deployment.production_environment != true &&
      github.event.deployment.environment != 'Production' &&
      github.event.deployment.environment != 'production'
    runs-on: ubuntu-latest
    # Comment results on the pull request as a fallback, and ask GitHub for
    # a signed OIDC token that proves to Vitalgate which repository and
    # commit this is. No checkout: nothing is built here.
    permissions:
      pull-requests: write
      id-token: write
    timeout-minutes: 10
    steps:
      - name: Run Lighthouse on the preview
        timeout-minutes: 5
        env:
          PREVIEW_URL: \${{ github.event.deployment_status.environment_url || github.event.deployment_status.target_url }}
          # Optional: Vercel's "Protection Bypass for Automation" secret, for
          # previews behind Vercel Authentication.
          VERCEL_BYPASS: \${{ secrets.VERCEL_AUTOMATION_BYPASS_SECRET }}
        run: |
          EXTRA_HEADERS=()
          if [ -n "$VERCEL_BYPASS" ]; then
            EXTRA_HEADERS=(--extra-headers "{\\"x-vercel-protection-bypass\\":\\"$VERCEL_BYPASS\\"}")
          fi
          npx --yes lighthouse "$PREVIEW_URL" --output=json --output-path=./lighthouse.json --chrome-flags="--headless --no-sandbox" --max-wait-for-load=45000 "\${EXTRA_HEADERS[@]}"

${reportStep(opts.vitalgateOrigin, "preview")}`;
}
