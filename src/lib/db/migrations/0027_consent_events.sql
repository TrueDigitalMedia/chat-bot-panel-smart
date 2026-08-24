CREATE TYPE "public"."consent_type" AS ENUM('opt_in', 'terms', 're_engagement', 'opt_out');--> statement-breakpoint
CREATE TABLE "consent_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid NOT NULL,
	"consent_type" "consent_type" NOT NULL,
	"channel" "channel" NOT NULL,
	"decision" boolean NOT NULL,
	"consent_text_shown" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "consent_events" ADD CONSTRAINT "consent_events_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "consent_events_lead_created_idx" ON "consent_events" USING btree ("lead_id","created_at");
