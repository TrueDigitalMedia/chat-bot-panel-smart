-- Qualification / quota conversation evals (fixtures + per-lead results)

CREATE TABLE IF NOT EXISTS eval_fixtures (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  slug VARCHAR(80) NOT NULL UNIQUE,
  description TEXT NOT NULL,
  scenario_type VARCHAR(60) NOT NULL,
  input_snapshot JSONB NOT NULL,
  expected JSONB NOT NULL,
  tags JSONB,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS eval_fixtures_scenario_idx ON eval_fixtures (scenario_type);

CREATE TABLE IF NOT EXISTS conversation_evals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  fixture_id UUID REFERENCES eval_fixtures(id),
  correlation_id UUID,
  reason VARCHAR(80) NOT NULL,
  overall_score SMALLINT NOT NULL,
  passed BOOLEAN NOT NULL,
  checks JSONB NOT NULL,
  actual JSONB NOT NULL,
  expected JSONB NOT NULL,
  mismatches JSONB NOT NULL DEFAULT '[]'::jsonb,
  eval_version VARCHAR(20) NOT NULL DEFAULT 'v1',
  ran_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS conversation_evals_lead_ran_idx ON conversation_evals (lead_id, ran_at);
CREATE INDEX IF NOT EXISTS conversation_evals_passed_idx ON conversation_evals (passed);
