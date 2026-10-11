import {
	CheckCircleIcon,
	InfoIcon,
	WarningCircleIcon,
} from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
	CRUX_TILES,
	CruxMetricsView,
	formatCruxDay,
	formatCruxValue,
} from "@/components/crux-metrics-view";
import { MarketingShell } from "@/components/marketing-shell";
import { Reveal } from "@/components/reveal";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { CRUX_THRESHOLDS } from "@/lib/crux";
import type { CruxCheckDevice } from "@/lib/crux-checker";
import {
	type CruxCheckResult,
	checkCoreWebVitals,
} from "@/lib/crux-checker.functions";
import { CWV_CATEGORIES, CWV_SITES } from "@/lib/cwv-sites";
import { ogImageMeta, SITE_URL } from "@/lib/seo";

const PAGE_URL = `${SITE_URL}/tools/core-web-vitals`;
const DESCRIPTION =
	"Free Core Web Vitals checker: see INP, LCP and CLS for any site as real Chrome users experience them, with a 6-month INP trend and suggested performance budgets.";

export const Route = createFileRoute("/tools/core-web-vitals/")({
	validateSearch: (search): { url?: string; device?: CruxCheckDevice } => ({
		url:
			typeof search.url === "string" && search.url.trim() !== ""
				? search.url.slice(0, 2048)
				: undefined,
		device:
			search.device === "phone" || search.device === "desktop"
				? search.device
				: undefined,
	}),
	head: () => ({
		meta: [
			{ title: "Core Web Vitals checker (INP, LCP, CLS): Vitalgate" },
			{ name: "description", content: DESCRIPTION },
			{ property: "og:type", content: "website" },
			{ property: "og:url", content: PAGE_URL },
			{ property: "og:title", content: "Free Core Web Vitals checker" },
			{ property: "og:description", content: DESCRIPTION },
			...ogImageMeta("/og/core-web-vitals.png"),
			{ name: "twitter:card", content: "summary_large_image" },
		],
		links: [{ rel: "canonical", href: PAGE_URL }],
	}),
	component: CoreWebVitalsChecker,
});

const DEVICES: { id: CruxCheckDevice; label: string }[] = [
	{ id: "all", label: "All devices" },
	{ id: "phone", label: "Phone" },
	{ id: "desktop", label: "Desktop" },
];

function CoreWebVitalsChecker() {
	const search = Route.useSearch();
	const navigate = useNavigate({ from: Route.fullPath });
	const device = search.device ?? "all";
	const [input, setInput] = useState(search.url ?? "");
	useEffect(() => setInput(search.url ?? ""), [search.url]);

	const check = useQuery({
		queryKey: ["crux-check", search.url, device],
		queryFn: () =>
			checkCoreWebVitals({ data: { url: search.url ?? "", device } }),
		enabled: Boolean(search.url),
		staleTime: Number.POSITIVE_INFINITY,
		retry: false,
	});

	const submit = (nextDevice: CruxCheckDevice = device) => {
		const url = input.trim();
		if (!url) return;
		navigate({
			search: { url, device: nextDevice === "all" ? undefined : nextDevice },
		});
	};

	return (
		<MarketingShell>
			<section className="mx-auto max-w-4xl px-5 pt-20 pb-12">
				<Reveal>
					<span className="text-xs uppercase tracking-wider text-primary">
						Free tool
					</span>
					<h1 className="mt-2 text-3xl font-extrabold tracking-tight sm:text-4xl">
						Core Web Vitals checker
					</h1>
					<p className="mt-4 max-w-2xl text-muted-foreground">
						See how real Chrome users experience any website: INP, LCP and CLS
						at the 75th percentile over the last 28 days, straight from Google's
						Chrome UX Report. No sign-up.
					</p>
				</Reveal>
				<Reveal delay={0.06}>
					<form
						className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-end"
						onSubmit={(e) => {
							e.preventDefault();
							submit();
						}}
					>
						<div className="min-w-0 flex-1 space-y-1.5">
							<Label htmlFor="cwv-url">Website</Label>
							<Input
								id="cwv-url"
								inputMode="url"
								autoComplete="url"
								placeholder="example.com"
								value={input}
								onChange={(e) => setInput(e.target.value)}
								maxLength={2048}
								className="h-11 font-mono"
							/>
						</div>
						<Button
							loading={check.isFetching}
							type="submit"
							size="lg"
							className="h-11 bg-brand text-brand-foreground hover:bg-brand/90"
							disabled={!input.trim() || check.isFetching}
						>
							{check.isFetching ? "Checking…" : "Check Core Web Vitals"}
						</Button>
					</form>
					<fieldset className="mt-3 flex flex-wrap gap-1.5">
						<legend className="sr-only">Device</legend>
						{DEVICES.map((d) => (
							<button
								key={d.id}
								type="button"
								aria-pressed={device === d.id}
								onClick={() =>
									search.url
										? submit(d.id)
										: navigate({
												search: {
													device: d.id === "all" ? undefined : d.id,
												},
											})
								}
								className={`rounded-full border px-3 py-1 text-xs transition-colors ${
									device === d.id
										? "border-primary bg-primary/10 text-foreground"
										: "border-border text-muted-foreground hover:text-foreground"
								}`}
							>
								{d.label}
							</button>
						))}
					</fieldset>
				</Reveal>

				{search.url && (
					<div className="mt-10" aria-live="polite">
						{check.isPending ? (
							<Card className="p-5">
								<Skeleton className="h-5 w-48" />
								<div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
									{CRUX_TILES.map((t) => (
										<Skeleton key={t.metric} className="h-20" />
									))}
								</div>
							</Card>
						) : check.isError ? (
							<Notice tone="error">
								Something went wrong checking that site. Try again in a moment.
							</Notice>
						) : (
							<CheckResult result={check.data} />
						)}
					</div>
				)}
			</section>

			<section className="border-t border-border">
				<div className="mx-auto max-w-4xl px-5 py-16">
					<h2 className="text-xl font-bold tracking-tight">
						Core Web Vitals of popular sites
					</h2>
					<p className="mt-2 max-w-2xl text-sm text-muted-foreground">
						Real-user results for {CWV_SITES.length} sites, from the Chrome UX
						Report.
					</p>
					<div className="mt-8 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
						{CWV_CATEGORIES.map((category) => (
							<div key={category}>
								<h3 className="text-sm font-semibold">{category}</h3>
								<ul className="mt-2 space-y-1 text-sm">
									{CWV_SITES.filter((s) => s.category === category).map((s) => (
										<li key={s.slug}>
											<Link
												to="/tools/core-web-vitals/$site"
												params={{ site: s.slug }}
												className="text-muted-foreground hover:text-foreground"
											>
												{s.name}
											</Link>
										</li>
									))}
								</ul>
							</div>
						))}
					</div>
				</div>
			</section>

			<section className="border-t border-border">
				<div className="mx-auto grid max-w-4xl gap-10 px-5 py-16 md:grid-cols-2">
					<div>
						<h2 className="text-xl font-bold tracking-tight">
							What the Core Web Vitals measure
						</h2>
						<p className="mt-3 text-sm text-muted-foreground">
							Google rates a page by the 75th percentile of real visits: 3 in 4
							visitors must get a good experience for a metric to count as good.
							A site passes the assessment when LCP, CLS and INP are all good.
						</p>
					</div>
					<dl className="space-y-5 text-sm">
						{(
							[
								[
									"INP",
									"Interaction to Next Paint",
									"How quickly the page responds to clicks, taps and key presses.",
								],
								[
									"LCP",
									"Largest Contentful Paint",
									"How long the main content takes to appear.",
								],
								[
									"CLS",
									"Cumulative Layout Shift",
									"How much the layout jumps around while the page loads.",
								],
							] as const
						).map(([metric, name, desc]) => (
							<div key={metric}>
								<dt className="font-medium">
									{name}{" "}
									<span className="text-muted-foreground">({metric})</span>
								</dt>
								<dd className="mt-1 text-muted-foreground">
									{desc} Good at or under{" "}
									<span className="font-mono text-foreground">
										{formatCruxValue(metric, CRUX_THRESHOLDS[metric].good)}
									</span>
									, poor above{" "}
									<span className="font-mono text-foreground">
										{formatCruxValue(metric, CRUX_THRESHOLDS[metric].poor)}
									</span>
									.
								</dd>
							</div>
						))}
					</dl>
				</div>
				<div className="mx-auto max-w-4xl px-5 pb-20">
					<Card className="p-6">
						<h2 className="text-lg font-semibold">
							Real-user data tells you after the fact
						</h2>
						<p className="mt-2 max-w-2xl text-sm text-muted-foreground">
							The Chrome UX Report averages 28 days of visits, so a slow release
							shows up here weeks after it shipped. Vitalgate runs Lighthouse on
							every pull request and fails the check when a change breaks your
							budgets, before it reaches your users.
						</p>
						<Link to="/login" className="mt-4 inline-block">
							<Button className="bg-brand text-brand-foreground hover:bg-brand/90">
								Connect a repo for free
							</Button>
						</Link>
					</Card>
				</div>
			</section>
		</MarketingShell>
	);
}

function Notice({
	tone,
	children,
}: {
	tone: "info" | "error";
	children: React.ReactNode;
}) {
	const Icon = tone === "error" ? WarningCircleIcon : InfoIcon;
	return (
		<Card className="flex items-start gap-3 p-5">
			<Icon
				className={`mt-0.5 h-5 w-5 shrink-0 ${tone === "error" ? "text-destructive" : "text-muted-foreground"}`}
			/>
			<p className="text-sm text-muted-foreground">{children}</p>
		</Card>
	);
}

const ASSESSMENT = {
	passed: {
		icon: CheckCircleIcon,
		className: "text-success",
		title: "Core Web Vitals assessment: passed",
	},
	failed: {
		icon: WarningCircleIcon,
		className: "text-destructive",
		title: "Core Web Vitals assessment: failed",
	},
	insufficient: {
		icon: InfoIcon,
		className: "text-muted-foreground",
		title: "Not enough data for a full assessment",
	},
} as const;

function CheckResult({ result }: { result: CruxCheckResult }) {
	switch (result.status) {
		case "invalid-url":
			return (
				<Notice tone="error">
					That doesn't look like a website address. Try something like{" "}
					<span className="font-mono">example.com</span>.
				</Notice>
			);
		case "rate-limited":
			return (
				<Notice tone="error">
					You've checked a lot of sites in the last few minutes. Wait a bit and
					try again.
				</Notice>
			);
		case "unavailable":
			return (
				<Notice tone="error">
					The Chrome UX Report couldn't be reached. Try again in a moment.
				</Notice>
			);
		case "no-data":
			return (
				<Notice tone="info">
					Google doesn't have enough real-user data for{" "}
					<span className="font-mono">{result.origin}</span>. The Chrome UX
					Report only covers public sites with steady Chrome traffic. Try
					another device type, or the site's main domain.
				</Notice>
			);
	}

	const { origin, snapshot, assessment, budgets } = result;
	const verdict = ASSESSMENT[assessment];
	const VerdictIcon = verdict.icon;
	return (
		<div className="space-y-4">
			<Card className="p-5">
				<div className="flex flex-wrap items-start justify-between gap-3">
					<div>
						<div
							className={`flex items-center gap-2 font-semibold ${verdict.className}`}
						>
							<VerdictIcon className="h-5 w-5" weight="fill" />
							{verdict.title}
						</div>
						<p className="mt-1 text-xs text-muted-foreground">
							<span className="font-mono">{origin}</span>, 75th percentile,{" "}
							{formatCruxDay(snapshot.period.firstDate)} –{" "}
							{formatCruxDay(snapshot.period.lastDate)}
						</p>
					</div>
					<span className="text-[10px] text-muted-foreground">
						Chrome UX Report
					</span>
				</div>
				<CruxMetricsView snapshot={snapshot} />
			</Card>

			{budgets.length > 0 && (
				<Card className="p-5">
					<h2 className="font-semibold">Suggested pull request budgets</h2>
					<p className="mt-1 max-w-2xl text-xs text-muted-foreground">
						Limits a pull request must stay under in Vitalgate's Lighthouse run.
						Where the site is already good, the budget keeps it there; where it
						isn't, the budget stops it getting worse.
					</p>
					<ul className="mt-4 grid gap-3 sm:grid-cols-3">
						{budgets.map((b) => (
							<li
								key={b.metric}
								className="rounded-md border border-border p-3"
							>
								<div className="text-xs font-medium text-muted-foreground">
									{b.metric}
								</div>
								<div className="mt-1 font-mono text-lg font-semibold">
									≤ {formatCruxValue(b.metric, b.max)}
								</div>
								<div className="mt-0.5 text-[11px] text-muted-foreground">
									{b.reason === "keep-good"
										? "Keeps it good"
										: "Stops it getting worse"}
								</div>
							</li>
						))}
					</ul>
					<div className="mt-5 flex flex-wrap items-center gap-3">
						<Link to="/login">
							<Button className="bg-brand text-brand-foreground hover:bg-brand/90">
								Enforce these on every pull request
							</Button>
						</Link>
						<span className="text-xs text-muted-foreground">
							Free for one repository.
						</span>
					</div>
				</Card>
			)}
		</div>
	);
}
