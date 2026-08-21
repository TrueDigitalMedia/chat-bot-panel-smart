import type { MessagePool } from '@/lib/scheduler/messages'

// A single "your code is X, here are the app instructions, confirm here" template got
// auto-rejected by Meta: mixing an OTP-shaped variable with password-reset/verification
// instructions matches their phishing-pattern detection for non-Authentication
// templates. Split into the two Meta actually expects — a bare Authentication OTP
// template (strict format, no free text) and a separate Utility template for the
// instructions + confirm buttons.
export const REGISTRATION_CODE_OTP_TEMPLATE = 'registration_code_otp'
export const REGISTRATION_INSTRUCTIONS_CONFIRM_TEMPLATE = 'registration_instructions_confirm'
export const REGISTRATION_CODE_DELAYED_TEMPLATE = 'registration_code_delayed'

/** Stable logical id for a re-engagement variant — matches message_variants' unique (pool, attemptNumber, variantOrder). */
export function reengageTemplateLogicalId(
  pool: MessagePool,
  attemptNumber: 1 | 2 | 3,
  variantOrder: number,
): string {
  return `${pool}_a${attemptNumber}_v${variantOrder}`
}
