-- NSE CAM geo quota fields + GPS gate state
ALTER TABLE survey_profiles
  ADD COLUMN IF NOT EXISTS nse_region VARCHAR(100),
  ADD COLUMN IF NOT EXISTS geo_source VARCHAR(20),
  ADD COLUMN IF NOT EXISTS in_quota_geo BOOLEAN;

ALTER TABLE flow_states
  ADD COLUMN IF NOT EXISTS gps_gate_status VARCHAR(30),
  ADD COLUMN IF NOT EXISTS gps_proposal JSONB;
