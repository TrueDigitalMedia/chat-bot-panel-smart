-- Atribución de anuncios click-to-WhatsApp (Meta Ads).
--
-- Cuando alguien escribe desde un anuncio, el webhook trae el referral: Twilio como campos
-- Referral* del form y Meta Cloud API como messages[].referral. Guardarlo en el lead es lo
-- que permite unirlo después con su anuncio, ad set y campaña en Meta (ad_source_id es la
-- clave del join; ad_ctwa_clid cruza con los reportes de Ads).
--
-- Atribución de primer toque: se sella una sola vez y nunca se sobrescribe (el UPDATE de
-- recordLeadAdReferral filtra por ad_source_id IS NULL AND ad_ctwa_clid IS NULL), así que
-- un segundo anuncio no se roba la atribución del primero. Todas nullable: los leads que no
-- vienen de anuncio —y todos los anteriores a esta migración— quedan en NULL.
--
-- IMPORTANTE: migrate.ts usa el migrator `neon-http`, que manda cada sentencia por HTTPS
-- plano — NO hay transacción envolvente. Por eso cada sentencia es idempotente y el archivo
-- entero es re-ejecutable.
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "ad_source_id" varchar(64);--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "ad_source_type" varchar(20);--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "ad_source_url" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "ad_ctwa_clid" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "ad_headline" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "ad_body" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "ad_referred_at" timestamp with time zone;--> statement-breakpoint
-- El reporte por anuncio ("cuántos leads trajo este ad") agrupa por ad_source_id.
CREATE INDEX IF NOT EXISTS "leads_ad_source_id_idx" ON "leads" USING btree ("ad_source_id");
