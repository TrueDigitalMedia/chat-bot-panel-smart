-- Panel Smart / Kantar ai-lead-sync integration (POST lead_id + {codigo_pregunta, pregunta,
-- respuesta} responses, upserted per question). Same idiom as tdm_sync_status/tdm_last_sync_at:
-- panel_smart_synced_answers_json snapshots the last value sent per field so we can diff what's
-- actually changed since the last successful sync (used by both the phase-completion hook and
-- the hourly abandoned-conversation sweep).
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS panel_smart_sync_status VARCHAR(20),
  ADD COLUMN IF NOT EXISTS panel_smart_last_sync_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS panel_smart_synced_answers_json JSONB;
