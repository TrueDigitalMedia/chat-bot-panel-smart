import { cancelPendingJobs, scheduleJob } from '@/lib/scheduler/re-engagement'
import { REENGAGEMENT_DELAY_SECONDS } from '@/lib/scheduler/constants'
import { handlePhase1 } from './phases/phase-1'
import { handleOutOfFlow } from './faq-handler'
import { isTerminal } from '@/lib/state-machine/transitions'
import {
  handleRegistrationChoice,
  isRegistrationCallback,
  REGISTER_CALLBACK_NO,
  REGISTER_CALLBACK_YES,
} from '@/lib/onboarding/registration-choice'
import { handleCorrectionFlow, handleCorrectionIntent } from './correction'
import { resetLeadConversation } from '@/lib/db/leads'
import { sendText, sendInlineKeyboard } from '@/lib/messaging/send'
import { supportRedirect } from './exit-messages'
import { env } from '@/lib/env'
import type { Lead, LeadStatus } from '@/types/lead'
import type { ChannelInbound } from '@/types/channel'

const BUTTON_PREFIXES = [
  'd1:', 'd2:', 'd3:', 'country:', 'gender:', 'educationPsh:', 'cars:',
  'domesticHelp:', 'shoppingFrequency:', 'contactChannel:', 'contactSchedule:',
  'correct:',
]

const RESTART_PATTERN =
  /^\/start\b|^reiniciar$|^empezar( de nuevo)?$|^comenzar( de nuevo)?$|^hola\!?$|^buenas?$/i

function isExpectedAnswer(
  _lead: Lead,
  messageText: string,
  callbackData: string | undefined,
): boolean {
  if (callbackData) {
    return BUTTON_PREFIXES.some((p) => callbackData.startsWith(p))
  }
  return messageText.trim().length > 0
}

function isRestartRequest(text: string): boolean {
  return RESTART_PATTERN.test(text.trim())
}

export async function routeMessage(
  lead: Lead,
  inbound: ChannelInbound,
  correlationId: string,
): Promise<void> {
  const status = lead.leadStatus as LeadStatus
  const messageText = inbound.text
  const callbackData = inbound.callbackData

  if (!isTerminal(status)) {
    await cancelPendingJobs(lead.id, lead.currentPhase).catch(() => {})
  }

  // Allow restart from any state (including terminal) — avoids support-message loop
  if (messageText && isRestartRequest(messageText)) {
    const fresh = await resetLeadConversation(lead.id)
    await cancelPendingJobs(lead.id, lead.currentPhase).catch(() => {})
    await sendText(fresh, '¡Listo! Empezamos de nuevo 🚀')
    await handlePhase1(fresh, '', undefined, correlationId)
    return
  }

  if (status === 'waiting_for_code' && isRegistrationCallback(callbackData)) {
    await handleRegistrationChoice(lead, callbackData!, correlationId)
    return
  }

  // Waiting for mock registration confirmation — remind buttons, don't dump to support FAQ
  if (status === 'waiting_for_code') {
    await sendInlineKeyboard(
      lead,
      'Aún estamos en el paso de registro. Confirma con un botón:',
      [
        [{ text: '✅ Ya me registré', callback_data: REGISTER_CALLBACK_YES }],
        [{ text: '❌ No pude registrarme', callback_data: REGISTER_CALLBACK_NO }],
      ],
    )
    return
  }

  if (status === 'link_sent') {
    await sendText(
      lead,
      'Ya te envié los links de descarga. Cuando tengas el código de registro, sigue las instrucciones del bot.\n\nSi quieres empezar de nuevo, escribe /start',
    )
    return
  }

  if (status === 'incomplete' && lead.currentPhase === 1) {
    // Phone capture (telegram/web contact share or typed number)
    if (lead.d3IsShopper === true) {
      const { handlePhoneCapture, needsPhoneCapture } = await import('./phone-capture')
      if (needsPhoneCapture(lead)) {
        if (
          await handlePhoneCapture(lead, {
            text: messageText,
            contactPhone: inbound.contactPhone,
          })
        ) {
          return
        }
      }
    }

    // GPS gate before manual country (NSE CAM quota)
    if (lead.d3IsShopper === true) {
      const { handleGpsCapture, needsGpsCapture } = await import('./gps-capture')
      if (await needsGpsCapture(lead)) {
        if (
          await handleGpsCapture(lead, {
            text: messageText,
            location: inbound.location,
            callbackData,
            correlationId,
          })
        ) {
          return
        }
      }
    }

    // Fuzzy geo confirmation (¿Quisiste decir Mixco?)
    if (callbackData) {
      const { handleGeoConfirmCallback } = await import('@/lib/geo/handle-confirm')
      if (await handleGeoConfirmCallback(lead, callbackData, correlationId)) {
        return
      }
    }

    if (await handleCorrectionFlow(lead, messageText, callbackData)) {
      return
    }

    if (messageText && (await handleCorrectionIntent(lead, messageText))) {
      return
    }

    if (isExpectedAnswer(lead, messageText, callbackData)) {
      await handlePhase1(lead, messageText, callbackData, correlationId)
    } else {
      await handleOutOfFlow(lead, messageText || callbackData || '', correlationId)
    }

    if (!isTerminal(status)) {
      const cadenceOverride = process.env.RE_ENGAGEMENT_CADENCE_OVERRIDE_SECONDS
      const delay = cadenceOverride
        ? Number(cadenceOverride.split(',')[0])
        : REENGAGEMENT_DELAY_SECONDS[1]
      await scheduleJob(lead.id, lead.currentPhase, 1, delay, 're-engage').catch(() => {})
    }
    return
  }

  // Terminal (or other leftover statuses): short message + restart hint — don't loop the long support blurb alone
  if (isTerminal(status)) {
    await sendText(
      lead,
      `${supportRedirect(env.SUPPORT_CONTACT)}\n\nSi quieres volver a intentarlo, escribe /start`,
    )
    return
  }

  await handleOutOfFlow(lead, messageText || callbackData || '', correlationId)
}
