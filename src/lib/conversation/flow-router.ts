import { cancelPendingJobs, cancelPendingRecontact, scheduleRecontact } from '@/lib/scheduler/re-engagement'
import { handlePhase1 } from './phases/phase-1'
import { handleOutOfFlow } from './faq-handler'
import { isTerminal } from '@/lib/state-machine/transitions'
import { transitionLead } from '@/lib/state-machine'
import {
  handleRegistrationChoice,
  isRegistrationCallback,
  sendRegistrationConfirmReminder,
} from '@/lib/onboarding/registration-choice'
import { handleAppDownloaded, isAppDownloadedCallback } from '@/lib/onboarding/app-downloaded'
import { handleReengageChoice, isReengageCallback } from './reengage-choice'
import { handleCorrectionFlow, tryHandleCorrectionRequest } from './correction'
import { SURVEY_QUESTIONS } from './survey-questions'
import { resetLeadConversation } from '@/lib/db/leads'
import { hasSentOutboundMessage } from '@/lib/db/conversation-messages'
import { sendText } from '@/lib/messaging/send'
import { supportRedirect, agentHandoffReply } from './exit-messages'
import { mightBeAgenteTypo } from './agent-typo'
import { mightBeOptOutIntent } from './opt-out-heuristic'
import type { Lead, LeadStatus } from '@/types/lead'
import type { ChannelInbound } from '@/types/channel'

const BUTTON_PREFIXES = [
  'optin:', 'd1:', 'reengagement_consent:', 'd3:', 'country:', 'gender:', 'educationPsh:', 'cars:',
  'domesticHelp:', 'shoppingFrequency:', 'contactChannel:', 'contactSchedule:',
  'isPregnant:', 'hasBabyUnder3:', 'householdSize:', 'bedrooms:',
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

/** Free-text opt-out ("ya no me escriban", "STOP", etc.) — deliberately multi-word/
 *  specific phrases, never bare "no" (a legitimate answer to several yes/no survey
 *  questions), so a real survey answer is never misread as an opt-out. */
function isOptOutRequest(text: string): boolean {
  const t = text.trim().toLowerCase()
  if (!t) return false
  if (/^(stop|unsubscribe|baja)$/.test(t)) return true
  if (/no\s+me\s+(vuelvan?\s+a\s+)?escrib/.test(t)) return true
  if (/no\s+quiero\s+que\s+me\s+(contact|escrib|mensaje)/.test(t)) return true
  if (/ya\s+no\s+(me\s+)?(escriban|contacten|mensajeen)/.test(t)) return true
  if (/dej(a|en)\s+de\s+(escribirme|contactarme|mensajearme)/.test(t)) return true
  if (/no\s+molest(en|es)\s*(m[aá]s)?/.test(t)) return true
  return false
}

/** code_delivered_no_response can't transition straight to abandono (transitions.ts) —
 *  its only valid exits are code_delivered_registered/code_delivered_not_registered, so
 *  an opt-out from that state maps onto "declined", the closest equivalent. */
function optOutTargetStatus(status: LeadStatus): LeadStatus {
  return status === 'code_delivered_no_response' ? 'code_delivered_not_registered' : 'abandono'
}

/** Exact ask, no typo — the common case, handled without an AI call. */
function isExactAgentHandoffRequest(text: string): boolean {
  const t = text.trim().toLowerCase()
  if (!t) return false
  return /^agente\b/.test(t)
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

  // Allow restart from any state (including terminal) — avoids support-message loop.
  // Only applies once the bot has actually said something to this lead before — a brand
  // new lead's first "hola" is a greeting, not a restart request, and routing it through
  // here would send the restart ack before handlePhase1 runs, which would make its own
  // hasSentOutboundMessage check (the one gating the bootstrap GREETING_TEXT) see a
  // message that was never really part of the conversation.
  if (messageText && isRestartRequest(messageText) && (await hasSentOutboundMessage(lead.id))) {
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

  // Free-text opt-out from any non-terminal state — the only previously-honored opt-outs
  // were structured (opt-in/D1/re-engagement-consent button declines); a user typing
  // "ya no me escriban" instead of tapping a button had no dedicated handler and fell
  // through to FAQ/AI interpretation, so nothing guaranteed the bot would actually stop
  // messaging them. Checked ahead of every other branch below, same reasoning as restart.
  // Two-tier detection, same shape as the agent-handoff typo check below: isOptOutRequest
  // is free (regex, common phrasings only); mightBeOptOutIntent is a broader but still
  // cheap keyword pre-filter, and only messages that pass it spend an AI call
  // (detectOptOutIntent) confirming genuine intent — covers atypical phrasing/typos the
  // regex alone would miss, without running an AI check on every ordinary survey answer.
  if (messageText && !isTerminal(status)) {
    let isOptOut = isOptOutRequest(messageText)
    if (!isOptOut && mightBeOptOutIntent(messageText)) {
      const { detectOptOutIntent } = await import('./detect-opt-out')
      isOptOut = await detectOptOutIntent(messageText, { leadId: lead.id, correlationId })
    }
    if (isOptOut) {
      await cancelPendingJobs(lead.id, lead.currentPhase).catch(() => {})
      await cancelPendingRecontact(lead.id).catch(() => {})
      await transitionLead(lead.id, optOutTargetStatus(status), 'user_freetext_opt_out', correlationId)
      await sendText(
        lead,
        'Entendido, no hay problema 🙏. No te seguiremos contactando por este proceso. Si cambias de opinión, escríbenos aquí para retomarlo.',
      )
      return
    }
  }

  // Allow agent handoff from any state — purely informational, doesn't change lead status/phase.
  // Exact "agente" is handled with no AI cost; anything typo-close to it (mightBeAgenteTypo)
  // is confirmed with an AI call before treating it as a handoff request, so an unrelated
  // short survey answer that happens to resemble "agente" isn't misrouted.
  if (messageText) {
    if (isExactAgentHandoffRequest(messageText)) {
      await sendText(lead, agentHandoffReply())
      return
    }
    if (mightBeAgenteTypo(messageText)) {
      const { detectAgentHandoffIntent } = await import('./detect-agent-handoff')
      if (await detectAgentHandoffIntent(messageText, { leadId: lead.id, correlationId })) {
        await sendText(lead, agentHandoffReply())
        return
      }
    }
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

  // Continue/stop buttons attached to the 2nd re-engagement nudge (jobs/re-engage) —
  // checked before any status branch since it can arrive while the lead is in any of
  // the 3 recontact pools (phase 1, link_sent, code_delivered_registered).
  if (isReengageCallback(callbackData)) {
    await handleReengageChoice(lead, callbackData!, correlationId)
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
    await sendRegistrationConfirmReminder(lead)
    return
  }

  // Declined registration — a mistaken "No pude registrarme" tap isn't necessarily
  // final: free text that reads like the user is still mid-registration ("me pide una
  // contraseña", "me equivoqué") means take them back to the confirm-buttons step
  // instead of dead-ending, same idea as the not_qualified/quota_exhausted reversal
  // below. Only tried when the decline was the user's own tap — a real TDM webhook
  // failure (registration_mock_webhook_failure) has nothing to "regret". Handled here,
  // ahead of the generic isTerminal/handleOutOfFlow fallbacks below, so a declined
  // registration never surfaces an unrelated FAQ answer.
  if (status === 'code_delivered_not_registered') {
    if (lead.statusReason === 'registration_user_decline' && messageText.trim()) {
      const { detectRegistrationRetryIntent } = await import('./detect-registration-retry')
      if (await detectRegistrationRetryIntent(messageText, { leadId: lead.id, correlationId })) {
        await transitionLead(lead.id, 'waiting_for_code', 'registration_decline_reversed', correlationId)
        await sendText(lead, '¡No hay problema! Confirmemos de nuevo:')
        await sendRegistrationConfirmReminder(lead)
        return
      }
    }
    await sendText(lead, supportRedirect())
    return
  }

  // Fase 4 — Ficha Hogar interactive questionnaire (spec 008). No FAQ digression
  // check here (research.md R7) — same simplicity as the waiting_for_code branch above.
  if (status === 'code_delivered_registered') {
    const { handleFichaHogarCorrectionFlow, tryHandleFichaHogarCorrectionRequest } = await import(
      './ficha-hogar-correction'
    )
    if (await handleFichaHogarCorrectionFlow(lead, callbackData)) {
      await scheduleRecontact(lead.id, correlationId).catch(() => {})
      return
    }
    // Cheap regex-only pass here (no AI) — same reasoning as the survey's pre-check
    // above; the AI fallback runs later from phase-4.ts's own failure branches.
    if (
      messageText &&
      (await tryHandleFichaHogarCorrectionRequest(lead, messageText, correlationId, '', { useAIFallback: false }))
    ) {
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
      `Aún no hemos podido confirmar tu código de registro — puede tardar unos minutos después de descargar la app. Te lo enviaremos apenas esté listo.\n\nSi ya pasó un rato largo y no llega, nuestro equipo se pondrá en contacto contigo en un plazo de 24 a 72 horas.`,
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
      await scheduleRecontact(lead.id, correlationId).catch(() => {})
      return
    }

    if (messageText) {
      const pendingQuestionText = SURVEY_QUESTIONS[lead.surveyQuestionIndex - 1]?.text ?? ''
      // Cheap regex-only pass here (no AI) — this runs ahead of every answer attempt, so
      // the AI fallback only kicks in later, from phase-1.ts's own "couldn't resolve this
      // answer" branches, once normal answer-resolution has already failed.
      if (
        await tryHandleCorrectionRequest(lead, messageText, correlationId, pendingQuestionText, {
          useAIFallback: false,
        })
      ) {
        await scheduleRecontact(lead.id, correlationId).catch(() => {})
        return
      }
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
