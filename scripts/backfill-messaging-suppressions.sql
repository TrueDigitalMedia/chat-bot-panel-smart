-- One-time backfill for audit §3.2 (migration 0033_messaging_suppressions).
-- Seeds messaging_suppressions from leads that ALREADY opted out, so a returning phone is
-- honored immediately instead of only on opt-outs recorded from now on. Keyed the same way
-- src/lib/db/suppressions.ts does it (E.164 for a WhatsApp phone channelUserId, raw
-- otherwise, plus a distinct valid stored phone_number). Idempotent — safe to re-run.
--
-- Run:  psql "$POSTGRES_URL" -f scripts/backfill-messaging-suppressions.sql

BEGIN;

INSERT INTO messaging_suppressions (channel, identifier, reason, source, lead_id)
SELECT l.channel,
       CASE
         WHEN l.channel = 'whatsapp' AND l.channel_user_id ~ '^\+?[0-9]+$'
           THEN CASE WHEN l.channel_user_id LIKE '+%' THEN l.channel_user_id ELSE '+' || l.channel_user_id END
         ELSE l.channel_user_id
       END,
       l.status_reason,
       'backfill_2026_09_10',
       l.id
FROM leads l
WHERE l.status_reason IN (
  'user_freetext_opt_out',
  're_engagement_declined_1st_attempt', 're_engagement_declined_2nd_attempt',
  're_engagement_declined_3rd_attempt', 're_engagement_declined', 'twilio_stop'
)
ON CONFLICT (channel, identifier) DO NOTHING;

INSERT INTO messaging_suppressions (channel, identifier, reason, source, lead_id)
SELECT l.channel, l.phone_number, l.status_reason, 'backfill_2026_09_10', l.id
FROM leads l
WHERE l.status_reason IN (
  'user_freetext_opt_out',
  're_engagement_declined_1st_attempt', 're_engagement_declined_2nd_attempt',
  're_engagement_declined_3rd_attempt', 're_engagement_declined', 'twilio_stop'
)
AND l.phone_number ~ '^\+[0-9]{8,14}$'
ON CONFLICT (channel, identifier) DO NOTHING;

SELECT source, count(*) FROM messaging_suppressions GROUP BY 1;

COMMIT;
