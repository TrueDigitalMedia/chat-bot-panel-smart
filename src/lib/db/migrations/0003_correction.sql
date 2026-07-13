-- Correction mode on flow_states
ALTER TABLE flow_states
  ADD COLUMN IF NOT EXISTS is_correcting BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS correcting_field VARCHAR(50),
  ADD COLUMN IF NOT EXISTS correction_resume_index SMALLINT;
