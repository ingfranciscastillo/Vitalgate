CREATE TABLE "crux_origin_cache" (
	"key" text PRIMARY KEY NOT NULL,
	"snapshot" jsonb,
	"fetched_at" timestamp DEFAULT now() NOT NULL
);
