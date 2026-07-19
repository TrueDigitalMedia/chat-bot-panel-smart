-- Ficha Hogar interactiva (Fase 4) — spec 008

-- New terminal status for panelists discarded by the conflict-of-interest question.
-- Safe as a standalone statement (not inside a multi-statement transaction) on
-- Postgres 12+ (Neon runs 15+) — see specs/008-ficha-hogar-interactive/research.md R2.
ALTER TYPE lead_status ADD VALUE IF NOT EXISTS 'ficha_hogar_descartado';

CREATE TABLE IF NOT EXISTS ficha_hogar_profiles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id UUID NOT NULL REFERENCES leads(id),
  question_index SMALLINT NOT NULL DEFAULT 0,
  conflict_of_interest BOOLEAN,
  has_internet BOOLEAN,
  relationship_to_hoh VARCHAR(20),
  date_of_birth VARCHAR(10),
  has_health_condition BOOLEAN,
  unlimited_data_plan BOOLEAN,
  pet_count SMALLINT,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ficha_hogar_profiles_lead_id_idx ON ficha_hogar_profiles (lead_id);
