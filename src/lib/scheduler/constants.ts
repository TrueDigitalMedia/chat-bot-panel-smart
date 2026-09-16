export const PHASE2_CODE_DELAY_SECONDS = 600 // 10 minutes — when we POST the registration-code request to TDM

// Sentinel attemptNumber for the registration_code_timeout job — distinct from
// request_registration_code's own attemptNumber 0 sharing the same phase, so their
// re_engagement_schedules rows (unique on leadId+phase+attemptNumber) never collide.
export const REGISTRATION_CODE_TIMEOUT_ATTEMPT_NUMBER = 95

// Re-engagement cadence: one delay per attempt, 0-indexed (index 0 = attempt 1). The
// Nth nudge is scheduled REENGAGEMENT_CADENCE_SECONDS[N-1] after the previous turn.
// Keep the running total under 24h so every nudge lands inside WhatsApp's
// customer-service window.
export const REENGAGEMENT_CADENCE_SECONDS = [
  4500,   // attempt 1 — 75 minutes
  25200,  // attempt 2 — 7 hours
  43200,  // attempt 3 — 12 hours
] as const

/**
 * The single knob for how many recontact nudges the bot sends before giving up.
 *
 * **Currently 0 — recontact is off.** Nobody gets an unsolicited nudge; a lead who goes
 * quiet is closed out silently by the `silent_abandon` job below (no message sent) so
 * the funnel still distinguishes "in progress" from "dropped off". Set 2026-09-16 in
 * response to the Meta "Sending spam" alert: every nudge is a MARKETING-category template
 * to someone who already stopped replying, which is the highest block/report-rate
 * message we send. See `docs/whatsapp/auditoria-alerta-spam-2026-09-16.md`.
 *
 * Values:
 *   0                      → no nudges at all; scheduleRecontact arms silent_abandon.
 *   1..CADENCE_SECONDS.length → send that many nudges, then RE_ENGAGEMENT_FINAL_TIMEOUT_SECONDS
 *                            before abandoning.
 *
 * To go above REENGAGEMENT_CADENCE_SECONDS.length, first add matching entries to that
 * array and to getFallbackMessage in scheduler/messages.ts. Raising it above 0 at all is
 * a policy decision, not just a tuning one — the a2/a3 templates were deleted from Meta
 * on 2026-09-16, so anything above 1 also needs templates recreated and re-approved.
 */
export const MAX_REENGAGEMENT_ATTEMPTS = 0

if (
  MAX_REENGAGEMENT_ATTEMPTS < 0 ||
  MAX_REENGAGEMENT_ATTEMPTS > REENGAGEMENT_CADENCE_SECONDS.length
) {
  throw new Error(
    `MAX_REENGAGEMENT_ATTEMPTS (${MAX_REENGAGEMENT_ATTEMPTS}) must be between 0 (disabled) and ` +
      `REENGAGEMENT_CADENCE_SECONDS.length (${REENGAGEMENT_CADENCE_SECONDS.length}) — ` +
      `add cadence + fallback-copy entries before raising it further.`,
  )
}

/** True when recontact is switched off entirely (MAX_REENGAGEMENT_ATTEMPTS = 0). */
export const RECONTACT_DISABLED = MAX_REENGAGEMENT_ATTEMPTS === 0

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

// Sentinel attemptNumber for the re_engagement_timeout job scheduled after the single
// nudge — distinct from the 1-3 attempt numbers themselves, so its
// re_engagement_schedules row never collides with the nudge's own row.
export const RE_ENGAGEMENT_TIMEOUT_ATTEMPT_NUMBER = 96

// Sentinel attemptNumber for the silent_abandon job (recontact disabled). Distinct from
// 95/96/99 so its re_engagement_schedules row never collides with the others'.
export const SILENT_ABANDON_ATTEMPT_NUMBER = 97

/**
 * How long a lead can stay idle before the silent close-out marks them abandoned, when
 * recontact is disabled. Deliberately the same total wall-clock as the old nudge path
 * (first-nudge delay 75m + RE_ENGAGEMENT_FINAL_TIMEOUT_SECONDS 12h) so turning recontact
 * off changes *what the lead receives* — nothing — without shifting when the funnel
 * considers them dropped off, keeping the before/after numbers comparable.
 */
export const SILENT_ABANDON_DELAY_SECONDS = REENGAGEMENT_CADENCE_SECONDS[0] + 43200 // 13h15m

// How long to wait, after sending the re-engagement nudge (with its own
// Continue/Stop buttons), before giving up on a lead who never taps either one. Must
// NOT be shorter than the time it takes a real person to notice and tap a WhatsApp
// message — see jobs/re-engage/route.ts's re_engagement_timeout handler, which used to
// mark the lead abandono synchronously in the same request that sent this exact
// message, making its own buttons impossible to ever act on.
export const RE_ENGAGEMENT_FINAL_TIMEOUT_SECONDS = 43200 // 12 hours

/**
 * Delay before the given attempt's nudge (attempt is 1-indexed). Values past the
 * configured cadence are clamped to the last defined step. Overridable via
 * RE_ENGAGEMENT_CADENCE_OVERRIDE_SECONDS (comma-separated, 1-indexed — e.g. "30,60,90"
 * for local testing). Centralizes the override-parsing that used to be duplicated at
 * each scheduling call site.
 */
export function reengagementDelaySeconds(attempt: number): number {
  const idx = Math.min(Math.max(attempt, 1), REENGAGEMENT_CADENCE_SECONDS.length) - 1
  const cadenceOverride = process.env.RE_ENGAGEMENT_CADENCE_OVERRIDE_SECONDS
  if (cadenceOverride) {
    const override = cadenceOverride.split(',').map(Number)[idx]
    if (override) return override
  }
  return REENGAGEMENT_CADENCE_SECONDS[idx]
}

// Scheduled right after the registration code is delivered (mock or real) — if the
// lead is still `waiting_for_code` when this fires, it's marked `code_delivered_no_response`.
export const REGISTRATION_FREEZE_DELAY_SECONDS = 72000 // 20 hours
// Sentinel attemptNumber for freeze_registration jobs — distinct from trigger_code's
// own 0-5 poll attempts sharing the same phase, so their re_engagement_schedules rows
// (unique on leadId+phase+attemptNumber) never collide.
export const FREEZE_REGISTRATION_ATTEMPT_NUMBER = 99
