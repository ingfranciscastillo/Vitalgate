import {
	type ErrorComponentProps,
	Link,
	useRouter,
} from "@tanstack/react-router";
import { useEffect } from "react";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";

function StatusLayout({
	code,
	title,
	children,
}: {
	code: string;
	title: string;
	children: React.ReactNode;
}) {
	return (
		<div className="grid min-h-screen place-items-center bg-background px-5 text-foreground">
			<div className="w-full max-w-md">
				<Link to="/" className="mb-10 inline-block">
					<Logo />
				</Link>
				<p className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
					{code}
				</p>
				<h1 className="mt-2 text-3xl font-extrabold tracking-tight">{title}</h1>
				{children}
			</div>
		</div>
	);
}

/** Shown for any URL that doesn't match a page (router's defaultNotFoundComponent). */
export function NotFoundPage() {
	return (
		<StatusLayout code="404" title="Page not found">
			<p className="mt-3 text-sm text-muted-foreground">
				The page you're looking for doesn't exist or has moved.
			</p>
			<div className="mt-8 flex flex-wrap gap-3">
				<Link to="/dashboard">
					<Button>Go to dashboard</Button>
				</Link>
				<Link to="/">
					<Button variant="outline">Back to home</Button>
				</Link>
			</div>
		</StatusLayout>
	);
}

/**
 * Shown when a page's loader or render throws (router's
 * defaultErrorComponent). The raw message only appears in development: in
 * production it could be a database error or similar that means nothing to
 * the person reading it.
 */
export function ErrorPage({ error, reset }: ErrorComponentProps) {
	const router = useRouter();

	useEffect(() => {
		console.error(error);
	}, [error]);

	const retry = async () => {
		// Re-run the failed loaders, then clear the error boundary.
		await router.invalidate();
		reset();
	};

	return (
		<StatusLayout code="Error" title="Something went wrong">
			<p className="mt-3 text-sm text-muted-foreground">
				This page couldn't load. It's usually temporary — try again in a moment.
				If it keeps happening, contact us.
			</p>
			{import.meta.env.DEV && error instanceof Error && (
				<pre className="mt-4 max-h-40 overflow-auto border border-border bg-muted/40 p-3 font-mono text-xs whitespace-pre-wrap text-destructive">
					{error.message}
				</pre>
			)}
			<div className="mt-8 flex flex-wrap gap-3">
				<Button onClick={retry}>Try again</Button>
				<Link to="/dashboard">
					<Button variant="outline">Go to dashboard</Button>
				</Link>
				<Link to="/contact">
					<Button variant="ghost">Contact us</Button>
				</Link>
			</div>
		</StatusLayout>
	);
}
