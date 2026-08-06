-- Adds an explicit action column to re_engagement_schedules (previously the job type
-- was inferred purely from attemptNumber numeric ranges) so recontact ('re-engage')
-- jobs can be found/cancelled by leadId alone, independent of which phase they were
-- filed under. Adds a pool column to message_variants/lead_message_variant_usage so
-- phase 1/2/4 recontact copy rotates independently instead of sharing (and colliding
-- on) a single attempt-number-keyed pool. See src/lib/scheduler/re-engagement.ts and
-- src/lib/scheduler/messages.ts.
DROP INDEX "lead_variant_usage_lead_attempt_idx";--> statement-breakpoint
DROP INDEX "message_variants_attempt_order_idx";--> statement-breakpoint
DROP INDEX "message_variants_attempt_idx";--> statement-breakpoint
ALTER TABLE "lead_message_variant_usage" ADD COLUMN "pool" varchar(30);--> statement-breakpoint
ALTER TABLE "message_variants" ADD COLUMN "pool" varchar(30);--> statement-breakpoint
ALTER TABLE "re_engagement_schedules" ADD COLUMN "action" varchar(30);--> statement-breakpoint
-- Backfill: every existing row predates the pool/action split, so it's all phase-1
-- generic re-engage copy.
UPDATE "lead_message_variant_usage" SET "pool" = 'phase1_reengage' WHERE "pool" IS NULL;--> statement-breakpoint
UPDATE "message_variants" SET "pool" = 'phase1_reengage' WHERE "pool" IS NULL;--> statement-breakpoint
-- Backfill: job type was previously encoded purely via attemptNumber sentinels/ranges
-- (see the historical comments in src/lib/scheduler/constants.ts) — 0 for
-- request_registration_code, 95 for registration_code_timeout, 99 for
-- freeze_registration, 96-98 for the now-retired link_sent_reminder, everything else
-- (1-3) for re-engage.
UPDATE "re_engagement_schedules" SET "action" = CASE
  WHEN "attempt_number" = 0 THEN 'request_registration_code'
  WHEN "attempt_number" = 95 THEN 'registration_code_timeout'
  WHEN "attempt_number" = 99 THEN 'freeze_registration'
  WHEN "attempt_number" BETWEEN 96 AND 98 THEN 'link_sent_reminder'
  ELSE 're-engage'
END WHERE "action" IS NULL;--> statement-breakpoint
ALTER TABLE "lead_message_variant_usage" ALTER COLUMN "pool" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "message_variants" ALTER COLUMN "pool" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "re_engagement_schedules" ALTER COLUMN "action" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "lead_variant_usage_lead_pool_attempt_idx" ON "lead_message_variant_usage" USING btree ("lead_id","pool","attempt_number");--> statement-breakpoint
CREATE UNIQUE INDEX "message_variants_pool_attempt_order_idx" ON "message_variants" USING btree ("pool","attempt_number","variant_order");--> statement-breakpoint
CREATE INDEX "message_variants_pool_attempt_idx" ON "message_variants" USING btree ("pool","attempt_number");--> statement-breakpoint
CREATE INDEX "re_engagement_lead_action_idx" ON "re_engagement_schedules" USING btree ("lead_id","action");
