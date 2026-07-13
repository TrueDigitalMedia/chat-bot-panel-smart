-- Phone number on lead (identity / contact). Required for telegram & web; WhatsApp uses channel_user_id.
ALTER TABLE leads ADD COLUMN IF NOT EXISTS phone_number VARCHAR(32);
