CREATE TABLE "twilio_content_cache" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"content_hash" varchar(64) NOT NULL,
	"kind" varchar(10) NOT NULL,
	"content_sid" varchar(64) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "conversation_messages" ADD COLUMN "provider_message_id" varchar(128);--> statement-breakpoint
CREATE UNIQUE INDEX "twilio_content_cache_hash_idx" ON "twilio_content_cache" USING btree ("content_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "conversation_messages_provider_msg_idx" ON "conversation_messages" USING btree ("channel","provider_message_id");