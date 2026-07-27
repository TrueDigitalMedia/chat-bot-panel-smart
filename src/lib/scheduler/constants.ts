export const PHASE2_CODE_DELAY_SECONDS = 600 // 10 minutes — when we POST the registration-code request to TDM

// Sentinel attemptNumber for the registration_code_timeout job — distinct from
// request_registration_code's own attemptNumber 0 sharing the same phase, so their
// re_engagement_schedules rows (unique on leadId+phase+attemptNumber) never collide.
export const REGISTRATION_CODE_TIMEOUT_ATTEMPT_NUMBER = 95

// Named map keyed by attempt number (1-indexed) to avoid off-by-one errors
export const REENGAGEMENT_DELAY_SECONDS: Record<1 | 2 | 3, number> = {
  1: 4500,   // 75 minutes
  2: 25200,  // 7 hours
  3: 72000,  // 20 hours
}

export const MAX_REENGAGEMENT_ATTEMPTS = 3

// Scheduled right after the registration code is delivered (mock or real) — if the
// lead is still `waiting_for_code` when this fires, it's marked `code_delivered_no_response`.
export const REGISTRATION_FREEZE_DELAY_SECONDS = 72000 // 20 hours
// Sentinel attemptNumber for freeze_registration jobs — distinct from trigger_code's
// own 0-5 poll attempts sharing the same phase, so their re_engagement_schedules rows
// (unique on leadId+phase+attemptNumber) never collide.
export const FREEZE_REGISTRATION_ATTEMPT_NUMBER = 99

// Scheduled right after the download links are sent (link_sent) — if the lead still
// hasn't downloaded/moved past link_sent when this fires, it re-asks, waiting
// linkSentReminderDelaySeconds() between each attempt, up to MAX_LINK_SENT_REMINDER_ATTEMPTS
// times total (re-engage/route.ts reschedules itself after each one until the max is hit).
export const LINK_SENT_REMINDER_DELAY_SECONDS = 7200 // 2 hours
export const MAX_LINK_SENT_REMINDER_ATTEMPTS = 2
// Reminder attempt N uses attemptNumber LINK_SENT_REMINDER_ATTEMPT_BASE+N (97, 98) —
// distinct from trigger_code's 0-5 poll attempts and freeze_registration's 99 sentinel,
// all sharing phase 2's re_engagement_schedules rows (unique on leadId+phase+attemptNumber).
export const LINK_SENT_REMINDER_ATTEMPT_BASE = 96

/**
 * LINK_SENT_REMINDER_DELAY_SECONDS, overridable on its own via
 * LINK_SENT_REMINDER_DELAY_SECONDS_OVERRIDE (e.g. 30 for local testing) without also
 * collapsing the trigger_code/freeze_registration timers that share
 * RE_ENGAGEMENT_TIMEOUT_OVERRIDE_SECONDS — falls back to that shared knob, then the
 * real 2h default.
 */
export function linkSentReminderDelaySeconds(): number {
  return (
    Number(process.env.LINK_SENT_REMINDER_DELAY_SECONDS_OVERRIDE) ||
    Number(process.env.RE_ENGAGEMENT_TIMEOUT_OVERRIDE_SECONDS) ||
    LINK_SENT_REMINDER_DELAY_SECONDS
  )
}
