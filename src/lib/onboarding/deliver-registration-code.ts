import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { leads } from '@/lib/db/schema'
import { transitionLead } from '@/lib/state-machine'
import { sendText, sendInlineKeyboard, sendTemplateOrKeyboard, sendTemplateOrText } from '@/lib/messaging/send'
import { scheduleFreezeRegistration } from '@/lib/scheduler/registration-freeze'
import { REGISTER_CALLBACK_YES, REGISTER_CALLBACK_NO } from './registration-choice'
import { getWhatsAppProvider } from '@/lib/whatsapp/provider'
import { getApprovedTemplate } from '@/lib/whatsapp/providers/twilio/templates'
import {
  REGISTRATION_CODE_OTP_TEMPLATE,
  REGISTRATION_INSTRUCTIONS_CONFIRM_TEMPLATE,
} from '@/lib/whatsapp/providers/twilio/template-ids'
import { isValidRegistrationPhone } from '@/lib/phone'
import type { Lead } from '@/types/lead'

const ONBOARDING_VIDEO = process.env.ONBOARDING_VIDEO_URL ?? ''

// Kept in sync with the approved WhatsApp/Twilio template body for
// REGISTRATION_INSTRUCTIONS_CONFIRM_TEMPLATE (scripts/twilio-templates.config.ts) —
// on that path this string is only the fallback; the two must match so every channel
// reads the same. The video now travels as a link inside this one message instead of a
// separate native video send.
const ONBOARDING_INSTRUCTIONS_TEXT =
  '📋 Pasos para registrarte en la app (tu código de registro está en el mensaje anterior ☝️):\n\n' +
  (ONBOARDING_VIDEO ? `🎬 Video con los pasos: ${ONBOARDING_VIDEO}\n\n` : '') +
  '1️⃣ Abre la app e ingresa a «¿Ha olvidado su contraseña?».\n' +
  '2️⃣ Escribe tu código de usuario y pulsa «entregar».\n' +
  '3️⃣ Escribe los últimos 4 dígitos de tu celular (el mismo que colocaste para contactarte).\n' +
  '4️⃣ Recibirás un código por mensaje de texto a tu número de celular; escríbelo para terminar la verificación.\n\n' +
  'Si tienes cualquier duda durante el registro, escríbeme y te ayudo.\n\n' +
  'Cuando hayas “activado” la app con ese código, confirma aquí:'

/**
 * Everything that happens once a registration code is in hand, however it arrived
 * (mock, or the real TDM webhook — src/app/api/webhooks/tdm-registration-code/route.ts):
 * transition to `waiting_for_code`, send the code then the instructions + confirm
 * buttons (walkthrough video linked inside that message), and arm the 20h inactivity
 * freeze. Single source of truth so neither path can drift from the
 * other — extracted from jobs/re-engage.ts's old mock/real-poll branches, which had
 * this duplicated.
 */
export async function deliverRegistrationCode(
  lead: Lead,
  code: string,
  opts: { reason: string; phase: number; mock?: boolean },
  correlationId: string,
): Promise<void> {
  await transitionLead(lead.id, 'waiting_for_code', opts.reason, correlationId)

  await db
    .update(leads)
    .set({ tdmRegistrationCode: code, updatedAt: new Date() })
    .where(eq(leads.id, lead.id))

  const label = opts.mock ? ' (mock)' : ''
  const codeText = `✅ Tu código de registro${label} es: ${code}`
  const instructionsText = ONBOARDING_INSTRUCTIONS_TEXT
  const buttons = [
    [{ text: '✅ Ya me registré', callback_data: REGISTER_CALLBACK_YES }],
    [{ text: '❌ No pude registrarme', callback_data: REGISTER_CALLBACK_NO }],
  ]
  // Mock codes (REGISTRATION_CODE_MOCK_ENABLED, test-only) always go out as plain
  // free-text messages — never through an approved template, since the "(mock)" label
  // wouldn't render cleanly inside the OTP template's variable and mock traffic should
  // never reach production credentials anyway.
  //
  // Meta rejects a single template mixing an OTP-shaped variable with password-reset/
  // verification instructions (phishing-pattern detection) — the approved templates are
  // split into a bare Authentication OTP template and a separate Utility template for
  // the instructions + confirm buttons. Only switch to those templates once BOTH are
  // confirmed approved; otherwise use plain free-text/keyboard sends, which also keeps
  // Telegram/web/Meta-direct WhatsApp and the mid-rollout "not approved yet" case working.
  const useSplitTemplates =
    !opts.mock &&
    lead.channel === 'whatsapp' &&
    getWhatsAppProvider() === 'twilio' &&
    (await getApprovedTemplate(REGISTRATION_CODE_OTP_TEMPLATE)) &&
    (await getApprovedTemplate(REGISTRATION_INSTRUCTIONS_CONFIRM_TEMPLATE))

  // Fixed 2-part sequence for every channel/path: (1) the code on its own, (2) the
  // instructions + confirm buttons, with the walkthrough video carried as a link inside
  // that second message (ONBOARDING_INSTRUCTIONS_TEXT) rather than a separate native
  // video send. Sending the code first and alone keeps it from being buried, and the
  // uniform order means the split-template and plain paths behave the same way apart
  // from which transport each step uses.

  // 1. Code.
  if (useSplitTemplates) {
    // Meta's own docs: "Business-scoped user IDs (BSUIDs) can be used to send any type
    // of message except for one-tap, zero-tap, and copy code authentication templates,
    // which require user phone numbers." Our OTP template is a copy-code Authentication
    // template, so it must be addressed by phoneNumber, not the lead's normal
    // channelUserId (which is the BSUID for a user on WhatsApp's username/privacy
    // feature) — confirmed by a real failure (Twilio error 63005, "Channel rejected
    // content") sending this exact template to a BSUID "To", and by a controlled retest.
    // The Utility instructions template below keeps routing via `lead`/channelUserId as
    // normal — Meta allows BSUID addressing for that.
    // phoneNumber should always be set by the time a WhatsApp lead reaches link_sent
    // (phone.ts's channelRequiresPhonePrompt / missing-phone-recovery.ts) — this falls
    // back to `lead` itself only as a defensive no-op for a pre-fix straggler.
    // Only address the copy-code Authentication template by phoneNumber when it's a
    // real number — a malformed/BSUID-derived value (non-null but junk, from the
    // pre-fix coercion bug) would 63005/131026 and hurt the delivery-rate KPI. Falling
    // back to `lead` routes via the BSUID channelUserId, where sendTemplateOrText's
    // template send fails cleanly and drops to a plain-text code send that works.
    const otpRecipient =
      lead.channel === 'whatsapp' && isValidRegistrationPhone(lead.phoneNumber)
        ? { ...lead, channelUserId: lead.phoneNumber }
        : lead
    await sendTemplateOrText(otpRecipient, REGISTRATION_CODE_OTP_TEMPLATE, codeText, {
      contentVariables: { '1': code },
    })
  } else {
    await sendText(lead, codeText)
  }

  // 2. Instructions + confirm buttons (the video link is embedded in the text).
  if (useSplitTemplates) {
    await sendTemplateOrKeyboard(lead, REGISTRATION_INSTRUCTIONS_CONFIRM_TEMPLATE, instructionsText, buttons)
  } else {
    await sendInlineKeyboard(lead, instructionsText, buttons)
  }

  await scheduleFreezeRegistration(lead.id, opts.phase)
}
