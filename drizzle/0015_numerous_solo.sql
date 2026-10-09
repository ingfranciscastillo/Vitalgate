CREATE TABLE "alert_reads" (
	"user_id" text NOT NULL,
	"alert_id" text NOT NULL,
	"read_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "alert_reads_user_id_alert_id_pk" PRIMARY KEY("user_id","alert_id")
);
--> statement-breakpoint
ALTER TABLE "alert_reads" ADD CONSTRAINT "alert_reads_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert_reads" ADD CONSTRAINT "alert_reads_alert_id_alerts_id_fk" FOREIGN KEY ("alert_id") REFERENCES "public"."alerts"("id") ON DELETE cascade ON UPDATE no action;