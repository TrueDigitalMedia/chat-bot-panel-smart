-- Sync de leads a MySQL de TDM (contrato de spec 001, nunca implementado). El `id` de
-- tb_leads_agente_ia es un AUTO_INCREMENT de MySQL que no controlamos, y no hay
-- constraint único para hacer upsert — guardamos el id asignado localmente y lo usamos
-- como llave para las escrituras posteriores. Ver specs/010-tdm-lead-sync/data-model.md.
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS tdm_lead_id INTEGER,
  ADD COLUMN IF NOT EXISTS tdm_sync_status VARCHAR(20),
  ADD COLUMN IF NOT EXISTS tdm_last_sync_at TIMESTAMPTZ;
