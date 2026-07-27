-- TDM registration code moves from MySQL polling to a request+webhook model: we POST a
-- JSON asking for the code, TDM calls back POST /api/webhooks/tdm-registration-code.
-- These columns let the timeout job tell "never requested" apart from "requested, no
-- reply yet" and persist the delivered code for idempotency/audit (never stored before).
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS tdm_registration_requested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS tdm_registration_code VARCHAR(64);
