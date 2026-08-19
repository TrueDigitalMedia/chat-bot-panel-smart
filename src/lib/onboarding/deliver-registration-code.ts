import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { leads } from '@/lib/db/schema'
import { transitionLead } from '@/lib/state-machine'
import { sendVideo, sendInlineKeyboard } from '@/lib/messaging/send'
import { scheduleFreezeRegistration } from '@/lib/scheduler/registration-freeze'
import { REGISTER_CALLBACK_YES, REGISTER_CALLBACK_NO } from './registration-choice'
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

  await sendInlineKeyboard(
    lead,
    `✅ Tu código de registro${label} es: ${code}\n\n` +
      `${ONBOARDING_INSTRUCTIONS_TEXT}\n\n` +
      `Cuando hayas “activado” la app con ese código, confirma aquí:`,
    [
      [{ text: '✅ Ya me registré', callback_data: REGISTER_CALLBACK_YES }],
      [{ text: '❌ No pude registrarme', callback_data: REGISTER_CALLBACK_NO }],
    ],
  )

  await scheduleFreezeRegistration(lead.id, opts.phase)
}
