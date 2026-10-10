import { cn } from "cn";

/** The bracket-and-pulse mark on its own, e.g. as an avatar. */
export function LogoMark({ className }: { className?: string }) {
	return (
		<svg
			width="22"
			height="22"
			viewBox="0 0 48 48"
			fill="none"
			className={cn("shrink-0", className)}
			aria-hidden="true"
		>
			<path
				d="M14 10H9V38H14"
				stroke="currentColor"
				strokeWidth="3.5"
				className="text-foreground"
			/>
			<path
				d="M34 10H39V38H34"
				stroke="currentColor"
				strokeWidth="3.5"
				className="text-foreground"
			/>
			<path
				d="M16 24H20L22 17L26 31L28 24H32"
				stroke="currentColor"
				strokeWidth="3.5"
				strokeLinejoin="round"
				strokeLinecap="square"
				className="text-brand"
			/>
		</svg>
	);
}

export function Logo({ className }: { className?: string }) {
	return (
		<div className={cn("flex items-center gap-2", className)}>
			<LogoMark />
			<span className="text-[15px] font-extrabold tracking-tight text-foreground">
				Vitalgate
			</span>
		</div>
	);
}
