-- WhatsApp numbered-choice fallback map
ALTER TABLE flow_states
  ADD COLUMN IF NOT EXISTS pending_wa_choices JSONB;
