export const PHASE2_CODE_DELAY_SECONDS = 600 // 10 minutes — when we POST the registration-code request to TDM

// Sentinel attemptNumber for the registration_code_timeout job — distinct from
// request_registration_code's own attemptNumber 0 sharing the same phase, so their
// re_engagement_schedules rows (unique on leadId+phase+attemptNumber) never collide.
export const REGISTRATION_CODE_TIMEOUT_ATTEMPT_NUMBER = 95

// Named map keyed by attempt number (1-indexed) to avoid off-by-one errors
export const REENGAGEMENT_DELAY_SECONDS: Record<1 | 2 | 3, number> = {
  1: 4500,   // 75 minutes
  2: 25200,  // 7 hours
  3: 43200,  // 12 hours (keep total < 24h with variant rotation)
}

export const MAX_REENGAGEMENT_ATTEMPTS = 3

// If a lead has already received this many outbound messages since their last inbound
// reply, the re-engage job (and scheduleRecontact, and every other job action) stops the
// cadence and marks them terminal (`code_delivered_no_response` from `waiting_for_code`,
// else `abandono`) instead of sending yet another nudge — the "freeze before chaining
// more than N without a response" safeguard against Meta-quality-tanking spaced bursts.
// Set to 4: it still clears the largest legitimate no-reply burst (a code delivery is
// code + video + instructions = 3 messages) but cuts the cascade at the 4th unanswered
// send. Kept below MAX_OUTBOUND_WITHOUT_REPLY in messaging/send.ts (5) so this orderly
// termination happens before the mute transport backstop kicks in.
export const REENGAGE_OUTBOUND_CEILING = 4

// Sentinel attemptNumber for the re_engagement_timeout job scheduled after the final
// (3rd) nudge — distinct from the 1-3 attempt numbers themselves, so its
// re_engagement_schedules row never collides with attempt 3's own row.
export const RE_ENGAGEMENT_TIMEOUT_ATTEMPT_NUMBER = 96

// How long to wait, after sending the final re-engagement nudge (with its own
// Continue/Stop buttons), before giving up on a lead who never taps either one. Must
// NOT be shorter than the time it takes a real person to notice and tap a WhatsApp
// message — see jobs/re-engage/route.ts's re_engagement_timeout handler, which used to
// mark the lead abandono synchronously in the same request that sent this exact
// message, making its own buttons impossible to ever act on.
export const RE_ENGAGEMENT_FINAL_TIMEOUT_SECONDS = 43200 // 12 hours

/**
 * REENGAGEMENT_DELAY_SECONDS[attempt], overridable via RE_ENGAGEMENT_CADENCE_OVERRIDE_SECONDS
 * (comma-separated, 1-indexed — e.g. "30,60,90" for local testing). Centralizes the
 * override-parsing that used to be duplicated at each scheduling call site.
 */
export function reengagementDelaySeconds(attempt: 1 | 2 | 3): number {
  const cadenceOverride = process.env.RE_ENGAGEMENT_CADENCE_OVERRIDE_SECONDS
  if (cadenceOverride) {
    const delays = cadenceOverride.split(',').map(Number)
    const override = delays[attempt - 1]
    if (override) return override
  }
  return REENGAGEMENT_DELAY_SECONDS[attempt]
}

// Scheduled right after the registration code is delivered (mock or real) — if the
// lead is still `waiting_for_code` when this fires, it's marked `code_delivered_no_response`.
export const REGISTRATION_FREEZE_DELAY_SECONDS = 72000 // 20 hours
// Sentinel attemptNumber for freeze_registration jobs — distinct from trigger_code's
// own 0-5 poll attempts sharing the same phase, so their re_engagement_schedules rows
// (unique on leadId+phase+attemptNumber) never collide.
export const FREEZE_REGISTRATION_ATTEMPT_NUMBER = 99
