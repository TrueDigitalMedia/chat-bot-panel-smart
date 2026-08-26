import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { leads } from '@/lib/db/schema'
import { transitionLead } from '@/lib/state-machine'
import { sendVideo, sendInlineKeyboard, sendTemplateOrKeyboard, sendTemplateOrText } from '@/lib/messaging/send'
import { scheduleFreezeRegistration } from '@/lib/scheduler/registration-freeze'
import { REGISTER_CALLBACK_YES, REGISTER_CALLBACK_NO } from './registration-choice'
import { getWhatsAppProvider } from '@/lib/whatsapp/provider'
import { getApprovedTemplate } from '@/lib/whatsapp/providers/twilio/templates'
import { isBsuidChannelUserId } from '@/lib/whatsapp/phone'
import {
  REGISTRATION_CODE_OTP_TEMPLATE,
  REGISTRATION_INSTRUCTIONS_CONFIRM_TEMPLATE,
} from '@/lib/whatsapp/providers/twilio/template-ids'
import type { Lead } from '@/types/lead'

const ONBOARDING_VIDEO = process.env.ONBOARDING_VIDEO_URL ?? ''

const ONBOARDING_INSTRUCTIONS_TEXT =
  '📋 Estos son los pasos para registrarte en la app; tu código de registro va justo a continuación 👇\n\n' +
  '1️⃣ Abre la app e ingresa a «¿Ha olvidado su contraseña?».\n' +
  '2️⃣ Escribe tu código de usuario y pulsa «entregar».\n' +
  '3️⃣ Escribe los últimos 4 dígitos de tu celular (el mismo que colocaste para contactarte).\n' +
  '4️⃣ Recibirás un código por mensaje de texto a tu número de celular; escríbelo para terminar la verificación.\n\n' +
  'Si tienes cualquier duda durante el registro, escríbeme y te ayudo.'

/**
 * Everything that happens once a registration code is in hand, however it arrived
 * (mock, or the real TDM webhook — src/app/api/webhooks/tdm-registration-code/route.ts):
 * transition to `waiting_for_code`, optional video, confirm-buttons message, and arm
 * the 20h inactivity freeze. Single source of truth so neither path can drift from the
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
  if (ONBOARDING_VIDEO) {
    await sendVideo(lead, ONBOARDING_VIDEO, '🎬 Video con los pasos para registrarte')
  }

  const text =
    `✅ Tu código de registro${label} es: ${code}\n\n` +
    `${ONBOARDING_INSTRUCTIONS_TEXT}\n\n` +
    `Cuando hayas “activado” la app con ese código, confirma aquí:`
  const buttons = [
    [{ text: '✅ Ya me registré', callback_data: REGISTER_CALLBACK_YES }],
    [{ text: '❌ No pude registrarme', callback_data: REGISTER_CALLBACK_NO }],
  ]
  // Mock codes (REGISTRATION_CODE_MOCK_ENABLED, test-only) always go out as a single
  // free-text message — never through an approved template, since the "(mock)" label
  // wouldn't render cleanly inside the OTP template's variable and mock traffic should
  // never reach production credentials anyway.
  //
  // Meta rejects a single template mixing an OTP-shaped variable with password-reset/
  // verification instructions (phishing-pattern detection) — the approved templates are
  // split into a bare Authentication OTP template and a separate Utility template for
  // the instructions + confirm buttons. Only switch to that two-message send once BOTH
  // are confirmed approved; otherwise send the exact same single combined message as
  // before, which also keeps Telegram/web/Meta-direct WhatsApp and the mid-rollout
  // "not approved yet" case behaving exactly like today.
  //
  // Meta also rejects the OTP template specifically (not the Utility one, not plain
  // text/keyboard sends) when the recipient is a Business-Scoped User ID rather than a
  // real phone number — confirmed via Twilio's delivery logs on a real failure: every
  // other message in the conversation delivered ("read"), only the OTP-template send
  // failed (error 63005, "Channel rejected content"). Fall back to the single combined
  // message for those leads, which we've directly observed routes to a BSUID fine.
  const useSplitTemplates =
    !opts.mock &&
    lead.channel === 'whatsapp' &&
    !isBsuidChannelUserId(lead.channelUserId) &&
    getWhatsAppProvider() === 'twilio' &&
    (await getApprovedTemplate(REGISTRATION_CODE_OTP_TEMPLATE)) &&
    (await getApprovedTemplate(REGISTRATION_INSTRUCTIONS_CONFIRM_TEMPLATE))

  if (useSplitTemplates) {
    await sendTemplateOrText(lead, REGISTRATION_CODE_OTP_TEMPLATE, `✅ Tu código de registro es: ${code}`, {
      contentVariables: { '1': code },
    })
    await sendTemplateOrKeyboard(
      lead,
      REGISTRATION_INSTRUCTIONS_CONFIRM_TEMPLATE,
      `${ONBOARDING_INSTRUCTIONS_TEXT}\n\nCuando hayas “activado” la app con ese código, confirma aquí:`,
      buttons,
    )
  } else {
    await sendInlineKeyboard(lead, text, buttons)
  }

  await scheduleFreezeRegistration(lead.id, opts.phase)
}
