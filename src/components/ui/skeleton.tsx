import { cn } from "cn";

/** Placeholder block in the shape of content that's loading, with a soft shimmer. */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="skeleton"
			aria-hidden="true"
			className={cn(
				"animate-shimmer rounded-md bg-[linear-gradient(90deg,var(--color-muted)_25%,color-mix(in_oklab,var(--color-muted)_55%,var(--color-background))_50%,var(--color-muted)_75%)] bg-[length:200%_100%]",
				className,
			)}
			{...props}
		/>
	);
}

export { Skeleton };
