export const PHASE2_CODE_DELAY_SECONDS = 600 // 10 minutes — first registration-code lookup attempt

// TDM's internal process writes `registration_code` into tb_leads_agente_ia on its own
// schedule, so the first lookup (at PHASE2_CODE_DELAY_SECONDS) may still find it empty —
// keep polling at this cadence until MAX_REGISTRATION_CODE_POLL_ATTEMPTS is reached.
export const REGISTRATION_CODE_POLL_DELAY_SECONDS = 120 // 2 minutes between re-checks
export const MAX_REGISTRATION_CODE_POLL_ATTEMPTS = 5 // ~10 more minutes of polling before giving up

// Named map keyed by attempt number (1-indexed) to avoid off-by-one errors
export const REENGAGEMENT_DELAY_SECONDS: Record<1 | 2 | 3, number> = {
  1: 4500,   // 75 minutes
  2: 25200,  // 7 hours
  3: 72000,  // 20 hours
}

export const MAX_REENGAGEMENT_ATTEMPTS = 3
