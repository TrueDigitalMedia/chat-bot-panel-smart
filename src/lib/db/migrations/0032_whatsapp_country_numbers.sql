-- Feature 017: WhatsApp country numbers (shared WABA).
-- Binds a WhatsApp lead to the Meta phone_number_id of the business number it messaged —
-- the number the bot replies from. Set once at lead creation from the inbound webhook's
-- value.metadata.phone_number_id; never re-bound. No backfill (existing leads stay null →
-- outbound falls back to WHATSAPP_PHONE_NUMBER_ID, i.e. today's behavior).
ALTER TABLE "leads" ADD COLUMN "whatsapp_phone_number_id" varchar(40);
--> statement-breakpoint
