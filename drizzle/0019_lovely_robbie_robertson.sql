CREATE TABLE "crux_reports" (
	"repo_id" text PRIMARY KEY NOT NULL,
	"origin" text NOT NULL,
	"snapshot" jsonb,
	"fetched_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "repos" ADD COLUMN "production_url" text;--> statement-breakpoint
ALTER TABLE "crux_reports" ADD CONSTRAINT "crux_reports_repo_id_repos_id_fk" FOREIGN KEY ("repo_id") REFERENCES "public"."repos"("id") ON DELETE cascade ON UPDATE no action;