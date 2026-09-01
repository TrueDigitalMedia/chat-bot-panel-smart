-- Audit for the pre-0bd66f9 "shared delivered_at" corruption in re_engagement_schedules.
-- Read-only. 0bd66f9 (the fix) landed 2026-08-31 16:25 -05.
--
-- A corrupt row = a schedule row whose delivered_at is byte-identical to a *sibling*
-- row's delivered_at (same lead_id + phase, different attempt_number). The old
-- bare-eq(lead_id) finalize stamped every sibling with the same timestamp in one UPDATE.

WITH sibling_shared AS (
  SELECT a.id,
         a.lead_id,
         a.phase,
         a.attempt_number,
         a.action,
         a.delivered_at,
         a.outcome,
         a.scheduled_at
  FROM re_engagement_schedules a
  JOIN re_engagement_schedules b
    ON b.lead_id = a.lead_id
   AND b.phase = a.phase
   AND b.attempt_number <> a.attempt_number
   AND b.delivered_at = a.delivered_at
  WHERE a.delivered_at IS NOT NULL
)
SELECT
  -- 1. total corrupt rows, split by whether they predate the fix
  count(*)                                                            AS corrupt_rows_total,
  count(*) FILTER (WHERE delivered_at >= TIMESTAMPTZ '2026-08-31 21:25:27+00') AS corrupt_rows_after_fix,
  count(DISTINCT lead_id)                                             AS leads_affected_total,
  count(DISTINCT lead_id) FILTER (WHERE delivered_at >= TIMESTAMPTZ '2026-08-31 21:25:27+00') AS leads_affected_after_fix
FROM sibling_shared;

-- 2. "live" corrupt rows: lead still contactable AND this row's own callback likely
--    never really fired (no outbound conversation_message within 2 min of delivered_at).
--    These are the only ones worth repairing (SET delivered_at = NULL, outcome = NULL).
WITH sibling_shared AS (
  SELECT a.*
  FROM re_engagement_schedules a
  JOIN re_engagement_schedules b
    ON b.lead_id = a.lead_id AND b.phase = a.phase
   AND b.attempt_number <> a.attempt_number
   AND b.delivered_at = a.delivered_at
  WHERE a.delivered_at IS NOT NULL
)
SELECT s.lead_id, s.phase, s.attempt_number, s.action, s.outcome, s.delivered_at, l.lead_status
FROM sibling_shared s
JOIN leads l ON l.id = s.lead_id
WHERE l.lead_status NOT IN ('not_qualified','quota_exhausted','ficha_hogar_completada','ficha_hogar_descartado','abandono')
  AND NOT EXISTS (
    SELECT 1 FROM conversation_messages m
    WHERE m.lead_id = s.lead_id
      AND m.direction = 'out'
      AND m.created_at BETWEEN s.delivered_at - INTERVAL '2 minutes' AND s.delivered_at + INTERVAL '2 minutes'
  )
ORDER BY s.delivered_at DESC;
