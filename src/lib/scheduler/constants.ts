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
