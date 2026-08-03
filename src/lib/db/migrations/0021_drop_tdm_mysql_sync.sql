-- Removes the direct-to-MySQL lead sync (tb_leads_agente_ia via tdm-mysql/*, spec 010).
-- There is no direct-database sync to TDM anymore — only the HTTP-based registration-code
-- webhook (tdm_registration_requested_at/tdm_registration_code, untouched) and the Panel
-- Smart / Kantar ai-lead-responses HTTP sync remain.
ALTER TABLE leads
  DROP COLUMN IF EXISTS tdm_lead_id,
  DROP COLUMN IF EXISTS tdm_sync_status,
  DROP COLUMN IF EXISTS tdm_last_sync_at;
