import { transitionLead } from '@/lib/state-machine'
import { handlePhase3Success, handlePhase3Failure } from '@/lib/conversation/phases/phase-3'
import { sendText, sendInlineKeyboard } from '@/lib/messaging/send'
import { cancelPendingRecontact } from '@/lib/scheduler/re-engagement'
import type { Lead } from '@/types/lead'

export const REGISTER_CALLBACK_YES = 'register:yes'
export const REGISTER_CALLBACK_NO = 'register:no'

export function isRegistrationCallback(callbackData: string | undefined): boolean {
  return callbackData === REGISTER_CALLBACK_YES || callbackData === REGISTER_CALLBACK_NO
}

/** Shared by the waiting_for_code reminder and the registration-decline reversal path. */
export async function sendRegistrationConfirmReminder(lead: Lead): Promise<void> {
  await sendInlineKeyboard(lead, 'Aún estamos en el paso de registro. Confirma con un botón:', [
    [{ text: '✅ Ya me registré', callback_data: REGISTER_CALLBACK_YES }],
    [{ text: '❌ No pude registrarme', callback_data: REGISTER_CALLBACK_NO }],
  ])
}

/**
 * Handles the user's mock registration choice from inline buttons.
 */
export async function handleRegistrationChoice(
  lead: Lead,
  callbackData: string,
  correlationId: string,
): Promise<void> {
  // code_delivered_no_response means the inactivity freeze fired before the user
  // replied — a late tap should still count, not just the still-pending case.
  if (lead.leadStatus !== 'waiting_for_code' && lead.leadStatus !== 'code_delivered_no_response') {
    await sendText(lead, 'Este paso de registro ya no está pendiente.')
    return
  }

  if (callbackData === REGISTER_CALLBACK_YES) {
    await sendText(lead, '✅ ¡Genial! Confirmamos tu registro.')
    await transitionLead(lead.id, 'code_delivered_registered', 'registration_user_confirm', correlationId)
    await handlePhase3Success(lead, correlationId)
    return
  }

  // A recontact job may already be armed from when the lead was still in link_sent/
  // waiting_for_code (scheduleRecontact) — code_delivered_not_registered isn't a
  // terminal status (a mistaken tap can still be reversed, see the transition above),
  // so that stale job wouldn't otherwise get cancelled and would fire a re-engagement
  // pitch at someone who just explicitly declined.
  await cancelPendingRecontact(lead.id).catch(() => {})
  await transitionLead(lead.id, 'code_delivered_not_registered', 'registration_user_decline', correlationId)
  await handlePhase3Failure(lead)
}
