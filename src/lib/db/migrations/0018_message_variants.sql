CREATE TABLE "message_variants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"attempt_number" smallint NOT NULL,
	"variant_order" smallint NOT NULL,
	"template_text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lead_message_variant_usage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid NOT NULL,
	"attempt_number" smallint NOT NULL,
	"variant_order" smallint NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "lead_message_variant_usage" ADD CONSTRAINT "lead_message_variant_usage_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "lead_variant_usage_lead_attempt_idx" ON "lead_message_variant_usage" USING btree ("lead_id","attempt_number");--> statement-breakpoint
CREATE INDEX "lead_variant_usage_lead_idx" ON "lead_message_variant_usage" USING btree ("lead_id","attempt_number");--> statement-breakpoint
CREATE INDEX "lead_variant_usage_sent_at_idx" ON "lead_message_variant_usage" USING btree ("sent_at");--> statement-breakpoint
CREATE UNIQUE INDEX "message_variants_attempt_order_idx" ON "message_variants" USING btree ("attempt_number","variant_order");--> statement-breakpoint
CREATE INDEX "message_variants_attempt_idx" ON "message_variants" USING btree ("attempt_number");
