CREATE TABLE "org_subscriptions" (
	"organization_id" text PRIMARY KEY NOT NULL,
	"polar_subscription_id" text NOT NULL,
	"status" text NOT NULL,
	"product_id" text NOT NULL,
	"customer_user_id" text,
	"current_period_end" timestamp,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"polar_modified_at" timestamp,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "org_subscriptions_polar_subscription_id_unique" UNIQUE("polar_subscription_id")
);
--> statement-breakpoint
ALTER TABLE "org_subscriptions" ADD CONSTRAINT "org_subscriptions_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_subscriptions" ADD CONSTRAINT "org_subscriptions_customer_user_id_user_id_fk" FOREIGN KEY ("customer_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;