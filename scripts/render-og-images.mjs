// Renders the 1200x630 Open Graph PNGs in public/ (og-image.png and og/*.png).
// Its dependencies are kept out of the app: copy it into a scratch directory,
// install them there, and pass this repo's public/ folder:
//   npm i satori@0.12.2 @resvg/resvg-js@2.6.2 @fontsource/archivo@5.2.5 @fontsource/jetbrains-mono@5.2.5
//   node render-og-images.mjs <repo>/public
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import satori from "satori";
import { Resvg } from "@resvg/resvg-js";

const out = process.argv[2];
mkdirSync(out, { recursive: true });
const font = (pkg, file) =>
	readFileSync(`node_modules/@fontsource/${pkg}/files/${file}`);
const fonts = [
	{ name: "Archivo", data: font("archivo", "archivo-latin-400-normal.woff"), weight: 400 },
	{ name: "Archivo", data: font("archivo", "archivo-latin-700-normal.woff"), weight: 700 },
	{ name: "Archivo", data: font("archivo", "archivo-latin-800-normal.woff"), weight: 800 },
	{ name: "Mono", data: font("jetbrains-mono", "jetbrains-mono-latin-400-normal.woff"), weight: 400 },
];

const BG = "#0B0D10";
const FG = "#F2F1EE";
const MUTED = "#9BA3AF";
const DIM = "#5B6470";
const BRAND = "#DC7F2E";

const h = (type, style, ...children) => ({
	type,
	props: { style: { display: "flex", ...style }, children: children.flat() },
});

const mark = (size) => ({
	type: "svg",
	props: {
		width: size,
		height: size * (220 / 240),
		viewBox: "-8 -8 256 236",
		children: [
			{ type: "path", props: { d: "M70 0H0V220H70", stroke: FG, "stroke-width": 16, fill: "none" } },
			{ type: "path", props: { d: "M170 0H240V220H170", stroke: FG, "stroke-width": 16, fill: "none" } },
			{
				type: "path",
				props: {
					d: "M40 110H100L115 30L155 190L180 110H200",
					stroke: BRAND,
					"stroke-width": 16,
					fill: "none",
					"stroke-linejoin": "round",
				},
			},
		],
	},
});

function card({ title, subtitle, path, chips = [] }) {
	return h(
		"div",
		{
			width: 1200,
			height: 630,
			background: BG,
			flexDirection: "column",
			justifyContent: "space-between",
			padding: "64px 80px",
			fontFamily: "Archivo",
			color: FG,
			borderTop: `8px solid ${BRAND}`,
		},
		h(
			"div",
			{ alignItems: "center", gap: 18 },
			mark(44),
			h("div", { fontSize: 32, fontWeight: 700, letterSpacing: -0.5 }, "Vitalgate"),
		),
		h(
			"div",
			{ flexDirection: "column", gap: 22 },
			h(
				"div",
				{ fontSize: title.length > 26 ? 68 : 80, fontWeight: 800, letterSpacing: -2.5, lineHeight: 1.02 },
				title,
			),
			h("div", { fontSize: 30, color: MUTED, lineHeight: 1.35, maxWidth: 960 }, subtitle),
			chips.length
				? h(
						"div",
						{ gap: 12, marginTop: 6 },
						chips.map((c) =>
							h(
								"div",
								{
									fontFamily: "Mono",
									fontSize: 20,
									color: FG,
									border: `2px solid #2A2F36`,
									padding: "8px 16px",
								},
								c,
							),
						),
					)
				: [],
		),
		h("div", { fontFamily: "Mono", fontSize: 22, color: DIM }, `vitalgate.vercel.app${path}`),
	);
}

const images = [
	{
		file: "og-image.png",
		title: "Stop shipping performance regressions",
		subtitle: "Lighthouse on every pull request. A failing check when a change breaks your budgets.",
		path: "",
		chips: ["LCP", "CLS", "FCP", "TBT", "Score", "INP (real users)"],
	},
	{
		file: "og/compare.png",
		title: "How Vitalgate compares",
		subtitle: "Against Lighthouse CI, Calibre and SpeedCurve, including where they're the better pick.",
		path: "/compare",
	},
	{
		file: "og/compare-lighthouse-ci.png",
		title: "Vitalgate vs Lighthouse CI",
		subtitle: "Same Lighthouse gate on your pull requests, without writing config, managing tokens or hosting a server.",
		path: "/compare/lighthouse-ci",
		chips: ["PR check + comment", "Median of 3 runs", "Preview deployments"],
	},
	{
		file: "og/compare-calibre.png",
		title: "Vitalgate vs Calibre",
		subtitle: "Calibre monitors your live site. Vitalgate stops the regression in the pull request, before it ships.",
		path: "/compare/calibre",
		chips: ["Before release", "Free for 1 repo"],
	},
	{
		file: "og/compare-speedcurve.png",
		title: "Vitalgate vs SpeedCurve",
		subtitle: "In-depth monitoring vs. a pass or fail on every pull request. When to use each.",
		path: "/compare/speedcurve",
		chips: ["Before release", "Free for 1 repo"],
	},
	{
		file: "og/core-web-vitals.png",
		title: "Core Web Vitals checker",
		subtitle: "INP, LCP and CLS for any site, as real Chrome users experience them. Free, no sign-up.",
		path: "/tools/core-web-vitals",
		chips: ["Chrome UX Report", "6-month INP trend"],
	},
];

for (const img of images) {
	const svg = await satori(card(img), { width: 1200, height: 630, fonts });
	const png = new Resvg(svg, { fitTo: { mode: "width", value: 1200 } }).render().asPng();
	const dest = join(out, img.file);
	mkdirSync(join(dest, ".."), { recursive: true });
	writeFileSync(dest, png);
	console.log(img.file, Math.round(png.length / 1024), "KB");
}
