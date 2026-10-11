import { cn } from "cn";

/**
 * Vitalgate's loading indicator: the logo mark with its pulse line tracing
 * itself, like a heart monitor. Static (fully drawn) under reduced motion.
 * Announces "Loading" to screen readers unless `decorative` (e.g. inside a
 * button whose own label already says what's happening).
 */
export function LogoLoader({
	className,
	label = "Loading",
	decorative = false,
	mono = false,
}: {
	className?: string;
	label?: string;
	decorative?: boolean;
	/** All in the current text colour — for buttons, where the brand orange could vanish into the background. */
	mono?: boolean;
}) {
	return (
		<span
			role={decorative ? undefined : "status"}
			className={cn("inline-flex shrink-0", className)}
		>
			<svg
				viewBox="0 0 48 48"
				fill="none"
				className="size-full"
				aria-hidden="true"
			>
				<path
					d="M14 10H9V38H14"
					stroke="currentColor"
					strokeWidth="3.5"
					className="opacity-40"
				/>
				<path
					d="M34 10H39V38H34"
					stroke="currentColor"
					strokeWidth="3.5"
					className="opacity-40"
				/>
				<path
					d="M16 24H20L22 17L26 31L28 24H32"
					pathLength={1}
					strokeDasharray="1 1"
					stroke="currentColor"
					strokeWidth="3.5"
					strokeLinejoin="round"
					strokeLinecap="square"
					className={cn("animate-trace", !mono && "text-brand")}
				/>
			</svg>
			{!decorative && <span className="sr-only">{label}</span>}
		</span>
	);
}

/**
 * Full-area loader for routes and panels: the mark, faded in after 200ms so
 * quick loads never flash it. `delay={false}` when something else (the
 * router's pending delay) already waited.
 */
export function PageLoader({
	className,
	delay = true,
}: {
	className?: string;
	delay?: boolean;
}) {
	return (
		<div
			className={cn(
				"grid min-h-[50vh] place-items-center",
				delay ? "animate-loader-in" : "animate-[loader-in_200ms_ease-out_both]",
				className,
			)}
		>
			<LogoLoader className="size-12 text-foreground" />
		</div>
	);
}
