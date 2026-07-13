-- Multichannel identity: (channel, channel_user_id) instead of telegram-only
-- Safe to re-run pieces; apply against existing Neon DB once.

DO $$ BEGIN
  CREATE TYPE channel AS ENUM ('telegram', 'whatsapp', 'web');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE leads ADD COLUMN IF NOT EXISTS channel channel;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS channel_user_id VARCHAR(128);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS channel_username VARCHAR(100);

-- Backfill existing Telegram leads (no-op if telegram_chat_id already dropped)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'leads' AND column_name = 'telegram_chat_id'
  ) THEN
    UPDATE leads
    SET
      channel = COALESCE(channel, 'telegram'::channel),
      channel_user_id = COALESCE(channel_user_id, telegram_chat_id::text),
      channel_username = COALESCE(channel_username, telegram_username)
    WHERE channel IS NULL OR channel_user_id IS NULL;
  END IF;
END $$;

UPDATE leads SET channel = 'telegram' WHERE channel IS NULL;
UPDATE leads SET channel_user_id = id::text WHERE channel_user_id IS NULL;

ALTER TABLE leads ALTER COLUMN channel SET DEFAULT 'telegram';
ALTER TABLE leads ALTER COLUMN channel SET NOT NULL;
ALTER TABLE leads ALTER COLUMN channel_user_id SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS leads_channel_user_idx ON leads (channel, channel_user_id);

DROP INDEX IF EXISTS leads_telegram_chat_id_idx;

ALTER TABLE leads DROP COLUMN IF EXISTS telegram_chat_id;
ALTER TABLE leads DROP COLUMN IF EXISTS telegram_username;
