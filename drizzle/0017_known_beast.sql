ALTER TABLE "org_tokens" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "org_tokens" CASCADE;--> statement-breakpoint
DROP INDEX "repos_organization_id_github_repo_id_unique";--> statement-breakpoint
CREATE UNIQUE INDEX "repos_github_repo_id_unique" ON "repos" USING btree ("github_repo_id");