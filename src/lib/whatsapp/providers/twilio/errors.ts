/**
 * Twilio REST error 21610 — "Attempt to send to unsubscribed recipient". Twilio's
 * Advanced Opt-Out keeps its own STOP list and blocks the send at its layer; it does
 * not always forward the inbound STOP to our webhook, so this failure is the only
 * signal we get that the recipient opted out. Callers use it to sync our own opt-out
 * state (see handle-twilio-stop.ts) instead of silently retrying the next nudge.
 */
const TWILIO_OPT_OUT_CODE = 21610

export function isTwilioOptOutError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: unknown }).code === TWILIO_OPT_OUT_CODE
  )
}
