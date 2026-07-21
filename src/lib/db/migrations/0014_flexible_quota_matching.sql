-- Cuotas flexibles por dimensión (spec 011): reemplaza el matching AND
-- (country+region+nse_level) por celdas independientes por dimensión
-- (nse | edad | integrantes) y agrega un tope agregado manual por región.
-- Ver specs/011-flexible-quota-matching/data-model.md.

ALTER TABLE quota_targets RENAME COLUMN nse_level TO dimension_value;
ALTER TABLE quota_targets ADD COLUMN dimension_type VARCHAR(20) NOT NULL DEFAULT 'nse';
ALTER TABLE quota_targets ALTER COLUMN dimension_type DROP DEFAULT;

DROP INDEX IF EXISTS quota_targets_country_region_nse_idx;
CREATE UNIQUE INDEX IF NOT EXISTS quota_targets_country_region_dim_idx
  ON quota_targets (country, region, dimension_type, dimension_value);

CREATE TABLE IF NOT EXISTS quota_region_caps (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  country VARCHAR(50) NOT NULL,
  region VARCHAR(100) NOT NULL,
  cap_count INTEGER,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS quota_region_caps_country_region_idx
  ON quota_region_caps (country, region);

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS quota_matched_dimension VARCHAR(20),
  ADD COLUMN IF NOT EXISTS quota_matched_value VARCHAR(20);
