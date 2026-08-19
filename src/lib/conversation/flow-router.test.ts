import { describe, it, expect, vi, beforeEach } from 'vitest'

const {
  cancelPendingJobs,
  cancelPendingRecontact,
  scheduleRecontact,
  handlePhase1,
  handleOutOfFlow,
  handleAppDownloaded,
  isAppDownloadedCallback,
  handleCorrectionFlow,
  tryHandleCorrectionRequest,
  resetLeadConversation,
  sendText,
  sendInlineKeyboard,
  handleFichaHogarCorrectionFlow,
  tryHandleFichaHogarCorrectionRequest,
  handleFichaHogar,
  hasSentOutboundMessage,
  sendRegistrationConfirmReminder,
  transitionLead,
  detectRegistrationRetryIntent,
  detectOptOutIntent,
} = vi.hoisted(() => ({
  cancelPendingJobs: vi.fn(),
  cancelPendingRecontact: vi.fn(),
  scheduleRecontact: vi.fn(),
  handlePhase1: vi.fn(),
  handleOutOfFlow: vi.fn(),
  handleAppDownloaded: vi.fn(),
  isAppDownloadedCallback: vi.fn(),
  handleCorrectionFlow: vi.fn(),
  tryHandleCorrectionRequest: vi.fn(),
  resetLeadConversation: vi.fn(),
  sendText: vi.fn(),
  sendInlineKeyboard: vi.fn(),
  handleFichaHogarCorrectionFlow: vi.fn(),
  tryHandleFichaHogarCorrectionRequest: vi.fn(),
  handleFichaHogar: vi.fn(),
  hasSentOutboundMessage: vi.fn(),
  sendRegistrationConfirmReminder: vi.fn(),
  transitionLead: vi.fn(),
  detectRegistrationRetryIntent: vi.fn(),
  detectOptOutIntent: vi.fn(),
}))

vi.mock('@/lib/scheduler/re-engagement', () => ({ cancelPendingJobs, cancelPendingRecontact, scheduleRecontact }))
vi.mock('./phases/phase-1', () => ({ handlePhase1 }))
vi.mock('./faq-handler', () => ({ handleOutOfFlow }))
vi.mock('@/lib/onboarding/registration-choice', () => ({
  handleRegistrationChoice: vi.fn(),
  isRegistrationCallback: vi.fn().mockReturnValue(false),
  sendRegistrationConfirmReminder,
}))
vi.mock('@/lib/state-machine', () => ({ transitionLead }))
vi.mock('./detect-registration-retry', () => ({ detectRegistrationRetryIntent }))
vi.mock('./detect-opt-out', () => ({ detectOptOutIntent }))
vi.mock('@/lib/onboarding/app-downloaded', () => ({ handleAppDownloaded, isAppDownloadedCallback }))
vi.mock('./reengage-choice', () => ({
  handleReengageChoice: vi.fn(),
  isReengageCallback: vi.fn().mockReturnValue(false),
  REENGAGE_CALLBACK_CONTINUE: 'reengage:continue',
  REENGAGE_CALLBACK_STOP: 'reengage:stop',
}))
vi.mock('./correction', () => ({ handleCorrectionFlow, tryHandleCorrectionRequest }))
vi.mock('@/lib/db/leads', () => ({ resetLeadConversation, reviveDeclinedLead: vi.fn() }))
vi.mock('@/lib/db/conversation-messages', () => ({ hasSentOutboundMessage }))
vi.mock('@/lib/messaging/send', () => ({ sendText, sendInlineKeyboard }))
vi.mock('./exit-messages', () => ({ supportRedirect: () => 'support redirect' }))
vi.mock('./ficha-hogar-correction', () => ({
  handleFichaHogarCorrectionFlow,
  tryHandleFichaHogarCorrectionRequest,
}))
vi.mock('./phases/phase-4', () => ({ handleFichaHogar }))
vi.mock('./detect-decline-reversal', () => ({ detectDeclineReversalIntent: vi.fn().mockResolvedValue(false) }))

import { routeMessage } from './flow-router'
import type { Lead } from '@/types/lead'
import type { ChannelInbound } from '@/types/channel'

function makeLead(overrides: Partial<Lead> = {}): Lead {
  return {
    id: 'lead-1',
    leadStatus: 'incomplete',
    currentPhase: 1,
    d3IsShopper: false,
    ...overrides,
  } as unknown as Lead
}

function makeInbound(overrides: Partial<ChannelInbound> = {}): ChannelInbound {
  return { text: '', callbackData: undefined, ...overrides } as ChannelInbound
}

beforeEach(() => {
  vi.resetAllMocks()
  cancelPendingJobs.mockResolvedValue(undefined)
  cancelPendingRecontact.mockResolvedValue(undefined)
  scheduleRecontact.mockResolvedValue(undefined)
  handleCorrectionFlow.mockResolvedValue(false)
  tryHandleCorrectionRequest.mockResolvedValue(false)
  tryHandleFichaHogarCorrectionRequest.mockResolvedValue(false)
  isAppDownloadedCallback.mockReturnValue(false)
  hasSentOutboundMessage.mockResolvedValue(true)
  detectRegistrationRetryIntent.mockResolvedValue(false)
  detectOptOutIntent.mockResolvedValue(false)
  transitionLead.mockResolvedValue(undefined)
})

describe('routeMessage — recontact scheduling', () => {
  it('phase-1 turn: cancels any stray recontact job up front, then schedules exactly once after dispatching', async () => {
    const lead = makeLead({ leadStatus: 'incomplete', currentPhase: 1 })

    await routeMessage(lead, makeInbound({ text: 'Guatemala' }), 'corr-1')

    expect(cancelPendingRecontact).toHaveBeenCalledWith('lead-1')
    expect(handlePhase1).toHaveBeenCalledWith(lead, 'Guatemala', undefined, 'corr-1')
    expect(scheduleRecontact).toHaveBeenCalledTimes(1)
    expect(scheduleRecontact).toHaveBeenCalledWith('lead-1', 'corr-1')
  })

  it('phase-1 turn: also schedules recontact when the correction menu callback is handled', async () => {
    handleCorrectionFlow.mockResolvedValue(true)
    const lead = makeLead({ leadStatus: 'incomplete', currentPhase: 1 })

    // No callbackData here — a truthy one would also exercise the (unmocked in this
    // file) handle-confirm geo-callback branch ahead of handleCorrectionFlow, which
    // isn't what this test is about.
    await routeMessage(lead, makeInbound({ text: '' }), 'corr-1')

    expect(handleCorrectionFlow).toHaveBeenCalledWith(lead, '', undefined)
    expect(handlePhase1).not.toHaveBeenCalled()
    expect(scheduleRecontact).toHaveBeenCalledWith('lead-1', 'corr-1')
  })

  it('phase-1 turn: also schedules recontact when a correction request is detected', async () => {
    tryHandleCorrectionRequest.mockResolvedValue(true)
    const lead = makeLead({ leadStatus: 'incomplete', currentPhase: 1 })

    await routeMessage(lead, makeInbound({ text: 'quiero corregir mi email' }), 'corr-1')

    expect(tryHandleCorrectionRequest).toHaveBeenCalledWith(lead, 'quiero corregir mi email', 'corr-1', '', {
      useAIFallback: false,
    })
    expect(handlePhase1).not.toHaveBeenCalled()
    expect(scheduleRecontact).toHaveBeenCalledWith('lead-1', 'corr-1')
  })

  it('link_sent branch (no app-downloaded tap): schedules recontact after the fallback message', async () => {
    const lead = makeLead({ leadStatus: 'link_sent', currentPhase: 2 })

    // Not "hola"/"reiniciar"/etc — those match isRestartRequest and short-circuit before
    // this branch is ever reached.
    await routeMessage(lead, makeInbound({ text: 'aún no la he descargado' }), 'corr-1')

    expect(sendText).toHaveBeenCalled()
    expect(scheduleRecontact).toHaveBeenCalledWith('lead-1', 'corr-1')
    expect(handleAppDownloaded).not.toHaveBeenCalled()
  })

  it('link_sent branch with an app-downloaded tap: delegates entirely, does not schedule recontact itself', async () => {
    isAppDownloadedCallback.mockReturnValue(true)
    const lead = makeLead({ leadStatus: 'link_sent', currentPhase: 2 })

    await routeMessage(lead, makeInbound({ callbackData: 'app_downloaded' }), 'corr-1')

    expect(handleAppDownloaded).toHaveBeenCalledWith(lead, 'corr-1')
    expect(scheduleRecontact).not.toHaveBeenCalled()
  })

  it('code_delivered_registered branch (normal Ficha Hogar turn): schedules recontact after handleFichaHogar', async () => {
    handleFichaHogarCorrectionFlow.mockResolvedValue(false)
    tryHandleFichaHogarCorrectionRequest.mockResolvedValue(false)
    const lead = makeLead({ leadStatus: 'code_delivered_registered', currentPhase: 4 })

    await routeMessage(lead, makeInbound({ text: 'sí' }), 'corr-1')

    expect(handleFichaHogar).toHaveBeenCalledWith(lead, 'sí', undefined, 'corr-1')
    expect(scheduleRecontact).toHaveBeenCalledWith('lead-1', 'corr-1')
  })

  it('code_delivered_registered branch: also schedules recontact when a correction menu is shown instead', async () => {
    handleFichaHogarCorrectionFlow.mockResolvedValue(false)
    tryHandleFichaHogarCorrectionRequest.mockResolvedValue(true)
    const lead = makeLead({ leadStatus: 'code_delivered_registered', currentPhase: 4 })

    await routeMessage(lead, makeInbound({ text: 'quiero corregir' }), 'corr-1')

    expect(tryHandleFichaHogarCorrectionRequest).toHaveBeenCalledWith(lead, 'quiero corregir', 'corr-1', '', {
      useAIFallback: false,
    })
    expect(handleFichaHogar).not.toHaveBeenCalled()
    expect(scheduleRecontact).toHaveBeenCalledWith('lead-1', 'corr-1')
  })

  it('restart request: cancels both the phase-scoped and the action-scoped recontact schedule', async () => {
    const lead = makeLead({ leadStatus: 'not_qualified', currentPhase: 1 })
    resetLeadConversation.mockResolvedValue(lead)

    await routeMessage(lead, makeInbound({ text: 'hola' }), 'corr-1')

    expect(cancelPendingJobs).toHaveBeenCalledWith('lead-1', 1)
    expect(cancelPendingRecontact).toHaveBeenCalledWith('lead-1')
  })

  it('a brand new lead\'s first "hola" is not treated as a restart — the bot never spoke to them yet', async () => {
    hasSentOutboundMessage.mockResolvedValue(false)
    const lead = makeLead({ leadStatus: 'incomplete', currentPhase: 1 })

    await routeMessage(lead, makeInbound({ text: 'hola' }), 'corr-1')

    expect(resetLeadConversation).not.toHaveBeenCalled()
    expect(sendText).not.toHaveBeenCalled()
    expect(handlePhase1).toHaveBeenCalledWith(lead, 'hola', undefined, 'corr-1')
  })
})

describe('routeMessage — declined registration (code_delivered_not_registered)', () => {
  it('a mistaken "No pude registrarme" tap is reversed when the user still sounds mid-registration', async () => {
    detectRegistrationRetryIntent.mockResolvedValue(true)
    const lead = makeLead({
      leadStatus: 'code_delivered_not_registered',
      statusReason: 'registration_user_decline',
    })

    await routeMessage(lead, makeInbound({ text: 'me pide una contraseña' }), 'corr-1')

    expect(detectRegistrationRetryIntent).toHaveBeenCalledWith('me pide una contraseña', {
      leadId: 'lead-1',
      correlationId: 'corr-1',
    })
    expect(transitionLead).toHaveBeenCalledWith(
      'lead-1',
      'waiting_for_code',
      'registration_decline_reversed',
      'corr-1',
    )
    expect(sendRegistrationConfirmReminder).toHaveBeenCalledWith(lead)
    expect(handleOutOfFlow).not.toHaveBeenCalled()
  })

  it('unrelated free text after a decline gets the plain support redirect, not the FAQ engine', async () => {
    const lead = makeLead({
      leadStatus: 'code_delivered_not_registered',
      statusReason: 'registration_user_decline',
    })

    // Not "hola"/"reiniciar"/etc — those match isRestartRequest and short-circuit
    // before this branch is ever reached (same caveat as the link_sent test above).
    await routeMessage(lead, makeInbound({ text: '¿cuánto tarda esto?' }), 'corr-1')

    expect(detectRegistrationRetryIntent).toHaveBeenCalled()
    expect(transitionLead).not.toHaveBeenCalled()
    expect(sendText).toHaveBeenCalledWith(lead, 'support redirect')
    expect(handleOutOfFlow).not.toHaveBeenCalled()
  })

  it('a real TDM webhook failure never attempts the AI reversal check', async () => {
    const lead = makeLead({
      leadStatus: 'code_delivered_not_registered',
      statusReason: 'registration_mock_webhook_failure',
    })

    await routeMessage(lead, makeInbound({ text: 'me pide una contraseña' }), 'corr-1')

    expect(detectRegistrationRetryIntent).not.toHaveBeenCalled()
    expect(transitionLead).not.toHaveBeenCalled()
    expect(sendText).toHaveBeenCalledWith(lead, 'support redirect')
  })
})

describe('routeMessage — free-text opt-out', () => {
  it('cancels pending jobs, transitions to abandono, and confirms — without dispatching to any phase handler', async () => {
    const lead = makeLead({ leadStatus: 'incomplete', currentPhase: 1 })

    await routeMessage(lead, makeInbound({ text: 'Ya no me escriban más por favor' }), 'corr-1')

    expect(cancelPendingJobs).toHaveBeenCalledWith('lead-1', 1)
    expect(cancelPendingRecontact).toHaveBeenCalledWith('lead-1')
    expect(transitionLead).toHaveBeenCalledWith('lead-1', 'abandono', 'user_freetext_opt_out', 'corr-1')
    expect(sendText).toHaveBeenCalledWith(lead, expect.stringContaining('No te seguiremos contactando'))
    expect(handlePhase1).not.toHaveBeenCalled()
    expect(scheduleRecontact).not.toHaveBeenCalled()
  })

  it('maps code_delivered_no_response to code_delivered_not_registered instead of abandono (invalid transition otherwise)', async () => {
    const lead = makeLead({ leadStatus: 'code_delivered_no_response', currentPhase: 2 })

    await routeMessage(lead, makeInbound({ text: 'no quiero que me contacten más' }), 'corr-1')

    expect(transitionLead).toHaveBeenCalledWith(
      'lead-1',
      'code_delivered_not_registered',
      'user_freetext_opt_out',
      'corr-1',
    )
  })

  it('does not misfire on a bare "no" — a legitimate yes/no survey answer', async () => {
    const lead = makeLead({ leadStatus: 'incomplete', currentPhase: 1 })

    await routeMessage(lead, makeInbound({ text: 'no' }), 'corr-1')

    expect(transitionLead).not.toHaveBeenCalled()
    expect(handlePhase1).toHaveBeenCalledWith(lead, 'no', undefined, 'corr-1')
  })

  it('is not re-triggered from an already-terminal state (falls through to the generic support redirect)', async () => {
    const lead = makeLead({ leadStatus: 'abandono', currentPhase: 1 })

    await routeMessage(lead, makeInbound({ text: 'ya no me escriban' }), 'corr-1')

    expect(transitionLead).not.toHaveBeenCalled()
    expect(sendText).toHaveBeenCalledWith(lead, 'support redirect')
  })

  it('atypical phrasing that the regex misses but the AI check confirms still opts the lead out', async () => {
    detectOptOutIntent.mockResolvedValue(true)
    const lead = makeLead({ leadStatus: 'incomplete', currentPhase: 1 })

    await routeMessage(lead, makeInbound({ text: 'me tienen asfixiada con tantos mensajes, ya paren' }), 'corr-1')

    expect(detectOptOutIntent).toHaveBeenCalledWith(
      'me tienen asfixiada con tantos mensajes, ya paren',
      { leadId: 'lead-1', correlationId: 'corr-1' },
    )
    expect(cancelPendingJobs).toHaveBeenCalledWith('lead-1', 1)
    expect(transitionLead).toHaveBeenCalledWith('lead-1', 'abandono', 'user_freetext_opt_out', 'corr-1')
    expect(handlePhase1).not.toHaveBeenCalled()
  })

  it('a message that only coincidentally matches the AI pre-filter keywords is not opted out when the AI says no', async () => {
    detectOptOutIntent.mockResolvedValue(false)
    const lead = makeLead({ leadStatus: 'incomplete', currentPhase: 1 })

    await routeMessage(lead, makeInbound({ text: 'mi email es contacto@empresa.com' }), 'corr-1')

    expect(detectOptOutIntent).toHaveBeenCalled()
    expect(transitionLead).not.toHaveBeenCalled()
    expect(handlePhase1).toHaveBeenCalledWith(lead, 'mi email es contacto@empresa.com', undefined, 'corr-1')
  })

  it('never spends an AI call on ordinary text with no opt-out-adjacent keywords', async () => {
    const lead = makeLead({ leadStatus: 'incomplete', currentPhase: 1 })

    await routeMessage(lead, makeInbound({ text: 'Guatemala' }), 'corr-1')

    expect(detectOptOutIntent).not.toHaveBeenCalled()
    expect(transitionLead).not.toHaveBeenCalled()
  })
})
