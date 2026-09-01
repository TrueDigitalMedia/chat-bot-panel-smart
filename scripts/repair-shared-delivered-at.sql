-- Repair for the pre-0bd66f9 "shared delivered_at" corruption in re_engagement_schedules.
--
-- ⚠️  RUN THIS ONLY AFTER 0bd66f9 IS DEPLOYED TO PRODUCTION. As of 2026-09-01 the audit
--     (scripts/audit-shared-delivered-at.sql) still shows fresh corruption dated after
--     the commit, which means the scoped finalizeSchedule is not yet live. Repairing now
--     just lets the still-running unscoped UPDATE re-corrupt the same rows.
--
-- What it does: for a schedule row that was collaterally stamped (its delivered_at is
-- byte-identical to a sibling row's, same lead_id+phase, different attempt_number) AND
-- that belongs to a still-contactable lead AND whose own callback almost certainly never
-- fired (no outbound conversation_message within 2 min of the stamped delivered_at),
-- reset delivered_at/outcome to NULL so claimSchedule treats it as deliverable again.
--
-- Dry run (default): prints the rows that WOULD be reset.
-- Apply: psql ... -v apply=1 -f scripts/repair-shared-delivered-at.sql

\set apply :apply
\if :{?apply}
\else
  \set apply 0
\endif

BEGIN;

CREATE TEMP TABLE _to_reset ON COMMIT DROP AS
WITH sib AS (
  SELECT DISTINCT a.id, a.lead_id, a.phase, a.attempt_number, a.action, a.delivered_at, a.outcome
  FROM re_engagement_schedules a
  JOIN re_engagement_schedules b
    ON b.lead_id = a.lead_id AND b.phase = a.phase
   AND b.attempt_number <> a.attempt_number
   AND b.delivered_at = a.delivered_at
  WHERE a.delivered_at IS NOT NULL
)
SELECT s.*
FROM sib s
JOIN leads l ON l.id = s.lead_id
WHERE l.lead_status NOT IN
      ('not_qualified','quota_exhausted','ficha_hogar_completada','ficha_hogar_descartado','abandono')
  AND NOT EXISTS (
    SELECT 1 FROM conversation_messages m
    WHERE m.lead_id = s.lead_id
      AND m.direction = 'out'
      AND m.created_at BETWEEN s.delivered_at - INTERVAL '2 minutes'
                           AND s.delivered_at + INTERVAL '2 minutes'
  );

SELECT count(*) AS rows_to_reset, count(DISTINCT lead_id) AS leads FROM _to_reset;
SELECT lead_id, phase, attempt_number, action, outcome, delivered_at FROM _to_reset ORDER BY delivered_at DESC;

\if :apply
  UPDATE re_engagement_schedules r
  SET delivered_at = NULL, outcome = NULL
  FROM _to_reset t
  WHERE r.id = t.id;
  SELECT 'APPLIED' AS status, count(*) FROM _to_reset;
  COMMIT;
\else
  SELECT 'DRY RUN — nothing changed. Re-run with -v apply=1 to apply.' AS status;
  ROLLBACK;
\endif
