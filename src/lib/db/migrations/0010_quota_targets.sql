-- Quota targets (Kantar CAM quota admin panel — replaces Kantar Quotas Test.xlsx)
CREATE TABLE IF NOT EXISTS quota_targets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  country VARCHAR(50) NOT NULL,
  region VARCHAR(100) NOT NULL,
  nse_level VARCHAR(20) NOT NULL,
  target_count INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS quota_targets_country_region_nse_idx
  ON quota_targets (country, region, nse_level);
