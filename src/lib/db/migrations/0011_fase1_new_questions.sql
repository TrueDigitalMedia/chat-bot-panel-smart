-- Fase 1 new questions: opt-in gate + edad/embarazo/bebé<3 (spec 007)

-- Opt-in gate (new decision point before D1). Backfill existing leads as already
-- opted-in (they predate this gate and shouldn't be re-prompted retroactively —
-- see specs/007-fase1-new-survey-questions/research.md R2), then flip the default
-- for future inserts.
ALTER TABLE leads ADD COLUMN IF NOT EXISTS opt_in_accepted BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE leads ALTER COLUMN opt_in_accepted SET DEFAULT false;

-- New survey fields (appended at the end of the question order — research.md R1).
ALTER TABLE survey_profiles
  ADD COLUMN IF NOT EXISTS age SMALLINT,
  ADD COLUMN IF NOT EXISTS is_pregnant BOOLEAN,
  ADD COLUMN IF NOT EXISTS has_baby_under_3 BOOLEAN;
