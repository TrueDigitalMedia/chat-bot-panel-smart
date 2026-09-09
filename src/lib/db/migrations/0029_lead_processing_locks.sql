CREATE TABLE "lead_processing_locks" (
	"lead_id" uuid PRIMARY KEY NOT NULL,
	"locked_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "lead_processing_locks" ADD CONSTRAINT "lead_processing_locks_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;
