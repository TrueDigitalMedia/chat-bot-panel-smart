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
  'optin:', 'd1:', 'd2:', 'd3:', 'country:', 'gender:', 'educationPsh:', 'cars:',
  'domesticHelp:', 'shoppingFrequency:', 'contactChannel:', 'contactSchedule:',
  'isPregnant:', 'hasBabyUnder3:',
  'correct:',
]

/** WhatsApp-friendly: /start, hola, reiniciar, empezar de nuevo, reiniciar flujo, etc. */
function isRestartRequest(text: string): boolean {
  const t = text.trim().toLowerCase()
  if (!t) return false
  if (/^\/start\b/.test(t)) return true
  if (/^(hola|buenas|buen[oa]s)\b[!?.]*$/.test(t)) return true
  if (/^(reiniciar|reset|restart)\b/.test(t)) return true
  if (/^(empezar|comenzar)(\s+de\s+nuevo)?(\s+(el\s+)?flujo)?\b/.test(t)) return true
  if (/^(de\s+nuevo|otra\s+vez)\b/.test(t)) return true
  return false
}

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

export async function routeMessage(
  lead: Lead,
  inbound: ChannelInbound,
  correlationId: string,
): Promise<void> {
  const status = lead.leadStatus as LeadStatus
  const messageText = inbound.text
  const callbackData = inbound.callbackData

  // Only cancel pending jobs for the phase-1 flow, where 're-engage' reminders are the
  // only thing ever scheduled (line ~176 below). cancelPendingJobs cancels by phase, not
  // by action — running it unconditionally here used to also cancel the phase-2
  // `trigger_code` job (the one that actually delivers the registration code) the moment
  // the user sent any message while `link_sent`/`waiting_for_code`, permanently stranding
  // them since nothing ever reschedules it.
  if (status === 'incomplete') {
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

  // Fase 4 — Ficha Hogar interactive questionnaire (spec 008). No FAQ digression
  // check here (research.md R7) — same simplicity as the waiting_for_code branch above.
  if (status === 'code_delivered_registered') {
    const {
      handleFichaHogarCorrectionFlow,
      detectsFichaHogarCorrectionIntent,
      showFichaHogarCorrectionMenu,
    } = await import('./ficha-hogar-correction')
    if (await handleFichaHogarCorrectionFlow(lead, callbackData)) return
    if (messageText && detectsFichaHogarCorrectionIntent(messageText)) {
      await showFichaHogarCorrectionMenu(lead)
      return
    }
    const { handleFichaHogar } = await import('./phases/phase-4')
    await handleFichaHogar(lead, messageText, callbackData, correlationId)
    return
  }

  if (status === 'link_sent') {
    await sendText(
      lead,
      `Aún no hemos podido confirmar tu código de registro — puede tardar unos minutos después de descargar la app. Te lo enviaremos apenas esté listo.\n\nSi ya pasó un rato largo y no llega, escríbenos a ${env.SUPPORT_CONTACT}.`,
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
    await sendText(lead, supportRedirect(env.SUPPORT_CONTACT))
    return
  }

  await handleOutOfFlow(lead, messageText || callbackData || '', correlationId)
}
