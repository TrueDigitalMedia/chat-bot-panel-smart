-- re_engagement_schedules.outcome was varchar(20), but several outcome strings the
-- re-engage job writes exceed 20 chars ('skipped_outbound_ceiling' = 24,
-- 'sent_final_awaiting_response' = 28, 'skipped_already_progressed' = 26, etc.),
-- causing `value too long for type character varying(20)` (SQLSTATE 22001) in prod.
ALTER TABLE "re_engagement_schedules" ALTER COLUMN "outcome" SET DATA TYPE varchar(64);
