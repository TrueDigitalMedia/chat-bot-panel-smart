import { cancelPendingJobs, cancelPendingRecontact, scheduleRecontact } from '@/lib/scheduler/re-engagement'
import { handlePhase1 } from './phases/phase-1'
import { handleOutOfFlow } from './faq-handler'
import { isTerminal } from '@/lib/state-machine/transitions'
import {
  handleRegistrationChoice,
  isRegistrationCallback,
  REGISTER_CALLBACK_NO,
  REGISTER_CALLBACK_YES,
} from '@/lib/onboarding/registration-choice'
import { handleAppDownloaded, isAppDownloadedCallback } from '@/lib/onboarding/app-downloaded'
import { handleCorrectionFlow, handleCorrectionIntent } from './correction'
import { resetLeadConversation } from '@/lib/db/leads'
import { sendText, sendInlineKeyboard } from '@/lib/messaging/send'
import { supportRedirect } from './exit-messages'
import type { Lead, LeadStatus } from '@/types/lead'
import type { ChannelInbound } from '@/types/channel'

const BUTTON_PREFIXES = [
  'optin:', 'd1:', 'reengagement_consent:', 'd2:', 'd3:', 'country:', 'gender:', 'educationPsh:', 'cars:',
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

  // Cancel any pending recontact job for the phase-1 flow at the top of each turn —
  // action-scoped (not phase-scoped) so it also catches a recontact job left archived
  // under a stale phase from a prior turn, not just ones filed under the current one.
  if (status === 'incomplete') {
    await cancelPendingRecontact(lead.id).catch(() => {})
  }

  // Allow restart from any state (including terminal) — avoids support-message loop
  if (messageText && isRestartRequest(messageText)) {
    const fresh = await resetLeadConversation(lead.id)
    // cancelPendingJobs (phase-scoped) also cancels functional jobs (e.g.
    // request_registration_code) the lead may have had pending mid-registration;
    // cancelPendingRecontact (action-scoped, cross-phase) is defense-in-depth so no
    // stray recontact job survives a restart regardless of which phase it was filed under.
    await cancelPendingJobs(lead.id, lead.currentPhase).catch(() => {})
    await cancelPendingRecontact(lead.id).catch(() => {})
    await sendText(fresh, '¡Listo! Empezamos de nuevo 🚀')
    await handlePhase1(fresh, '', undefined, correlationId)
    return
  }

  // code_delivered_no_response means the inactivity freeze fired before the user
  // replied (routinely 20h, or as little as RE_ENGAGEMENT_TIMEOUT_OVERRIDE_SECONDS in
  // tests) — a late tap on the real buttons should still be honored, not discarded.
  if (
    (status === 'waiting_for_code' || status === 'code_delivered_no_response') &&
    isRegistrationCallback(callbackData)
  ) {
    await handleRegistrationChoice(lead, callbackData!, correlationId)
    return
  }

  // Freeze already fired and this wasn't a registration button tap — same generic
  // support message isTerminal() would have given (code_delivered_no_response has a
  // real transition out now, so it no longer routes through that branch below).
  if (status === 'code_delivered_no_response') {
    await sendText(lead, supportRedirect())
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
    if (await handleFichaHogarCorrectionFlow(lead, callbackData)) {
      await scheduleRecontact(lead.id, correlationId).catch(() => {})
      return
    }
    if (messageText && detectsFichaHogarCorrectionIntent(messageText)) {
      await showFichaHogarCorrectionMenu(lead)
      await scheduleRecontact(lead.id, correlationId).catch(() => {})
      return
    }
    const { handleFichaHogar } = await import('./phases/phase-4')
    await handleFichaHogar(lead, messageText, callbackData, correlationId)
    await scheduleRecontact(lead.id, correlationId).catch(() => {})
    return
  }

  if (status === 'link_sent') {
    if (isAppDownloadedCallback(callbackData)) {
      await handleAppDownloaded(lead, correlationId)
      return
    }
    await sendText(
      lead,
      `Aún no hemos podido confirmar tu código de registro — puede tardar unos minutos después de descargar la app. Te lo enviaremos apenas esté listo.\n\nSi ya pasó un rato largo y no llega, nuestro equipo se pondrá en contacto contigo.`,
    )
    await scheduleRecontact(lead.id, correlationId).catch(() => {})
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
            correlationId,
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

    // scheduleRecontact re-reads the lead's fresh status/phase from the DB rather than
    // trusting `status`/`lead.currentPhase` above — handlePhase1 can transition the lead
    // out of phase 1 synchronously within this same call (e.g. completing the survey and
    // advancing into phase 2), and a stale pre-turn snapshot here previously caused a
    // phase-1-flavored recontact job to be scheduled even after the lead had moved on.
    await scheduleRecontact(lead.id, correlationId).catch(() => {})
    return
  }

  // Terminal (or other leftover statuses): short message + restart hint — don't loop the long support blurb alone
  if (isTerminal(status)) {
    // not_qualified/quota_exhausted reached via an opt-in/D1/D2/D3 decline aren't
    // necessarily final — "me equivoqué", "sí quiero inscribirme" etc. mean the user
    // regrets saying no. Resume right at the declined gate instead of dead-ending them.
    if ((status === 'not_qualified' || status === 'quota_exhausted') && messageText.trim()) {
      const { detectDeclineReversalIntent } = await import('./detect-decline-reversal')
      if (await detectDeclineReversalIntent(messageText, { leadId: lead.id, correlationId })) {
        const { reviveDeclinedLead } = await import('@/lib/db/leads')
        const revived = await reviveDeclinedLead(lead)
        if (revived) {
          await handlePhase1(revived, '', undefined, correlationId)
          return
        }
      }
    }
    await sendText(lead, supportRedirect())
    return
  }

  await handleOutOfFlow(lead, messageText || callbackData || '', correlationId)
}
