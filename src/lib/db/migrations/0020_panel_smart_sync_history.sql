CREATE TABLE "panel_smart_sync_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"lead_id" uuid NOT NULL,
	"status" varchar(10) NOT NULL,
	"fields_synced_json" jsonb,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "panel_smart_sync_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trigger" varchar(30) NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"total_count" integer DEFAULT 0 NOT NULL,
	"synced_count" integer DEFAULT 0 NOT NULL,
	"failed_count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "panel_smart_sync_attempts" ADD CONSTRAINT "panel_smart_sync_attempts_run_id_panel_smart_sync_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."panel_smart_sync_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "panel_smart_sync_attempts" ADD CONSTRAINT "panel_smart_sync_attempts_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "panel_smart_sync_attempts_run_idx" ON "panel_smart_sync_attempts" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "panel_smart_sync_attempts_lead_idx" ON "panel_smart_sync_attempts" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "panel_smart_sync_runs_started_idx" ON "panel_smart_sync_runs" USING btree ("started_at");