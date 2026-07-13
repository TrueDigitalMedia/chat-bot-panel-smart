-- Persist inbound/outbound messages for conversation monitoring UI
CREATE TYPE message_direction AS ENUM ('in', 'out');
CREATE TYPE message_content_type AS ENUM ('text', 'callback', 'contact', 'keyboard', 'video', 'system');

CREATE TABLE IF NOT EXISTS conversation_messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  direction message_direction NOT NULL,
  channel channel NOT NULL,
  content_type message_content_type NOT NULL DEFAULT 'text',
  body TEXT NOT NULL,
  meta JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS conversation_messages_lead_created_idx
  ON conversation_messages (lead_id, created_at);
