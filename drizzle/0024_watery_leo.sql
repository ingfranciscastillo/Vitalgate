CREATE TABLE "pull_issues" (
	"id" text PRIMARY KEY NOT NULL,
	"pull_request_id" text NOT NULL,
	"provider" text NOT NULL,
	"identifier" text NOT NULL,
	"url" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "integrations" ALTER COLUMN "encrypted_webhook_url" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "integrations" ADD COLUMN "encrypted_credentials" text;--> statement-breakpoint
ALTER TABLE "integrations" ADD COLUMN "config" jsonb;--> statement-breakpoint
ALTER TABLE "pull_issues" ADD CONSTRAINT "pull_issues_pull_request_id_pull_requests_id_fk" FOREIGN KEY ("pull_request_id") REFERENCES "public"."pull_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "pull_issues_pull_request_id_provider_unique" ON "pull_issues" USING btree ("pull_request_id","provider");