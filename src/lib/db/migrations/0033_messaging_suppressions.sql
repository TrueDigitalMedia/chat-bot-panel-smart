-- Audit §3.2: persistent per-recipient send-suppression list.
-- A lead's opt-out lives on its own row as a terminal statusReason, but a returning phone
-- that clicks a new click-to-WhatsApp ad becomes a fresh lead with no memory of the STOP.
-- This table is keyed by the contact identifier (normalized phone / BSUID / telegram id),
-- so the suppression outlives any single lead; messaging/send.ts checks it before every
-- outbound send. ON DELETE SET NULL so a lead cleanup never drops the suppression.
CREATE TABLE "messaging_suppressions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel" "channel" NOT NULL,
	"identifier" varchar(128) NOT NULL,
	"reason" text NOT NULL,
	"source" varchar(40) NOT NULL,
	"lead_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "messaging_suppressions" ADD CONSTRAINT "messaging_suppressions_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "messaging_suppressions_channel_identifier_idx" ON "messaging_suppressions" USING btree ("channel","identifier");
