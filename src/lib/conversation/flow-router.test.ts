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
  handleCorrectionIntent,
  resetLeadConversation,
  sendText,
  sendInlineKeyboard,
  handleFichaHogarCorrectionFlow,
  detectsFichaHogarCorrectionIntent,
  showFichaHogarCorrectionMenu,
  handleFichaHogar,
} = vi.hoisted(() => ({
  cancelPendingJobs: vi.fn(),
  cancelPendingRecontact: vi.fn(),
  scheduleRecontact: vi.fn(),
  handlePhase1: vi.fn(),
  handleOutOfFlow: vi.fn(),
  handleAppDownloaded: vi.fn(),
  isAppDownloadedCallback: vi.fn(),
  handleCorrectionFlow: vi.fn(),
  handleCorrectionIntent: vi.fn(),
  resetLeadConversation: vi.fn(),
  sendText: vi.fn(),
  sendInlineKeyboard: vi.fn(),
  handleFichaHogarCorrectionFlow: vi.fn(),
  detectsFichaHogarCorrectionIntent: vi.fn(),
  showFichaHogarCorrectionMenu: vi.fn(),
  handleFichaHogar: vi.fn(),
}))

vi.mock('@/lib/scheduler/re-engagement', () => ({ cancelPendingJobs, cancelPendingRecontact, scheduleRecontact }))
vi.mock('./phases/phase-1', () => ({ handlePhase1 }))
vi.mock('./faq-handler', () => ({ handleOutOfFlow }))
vi.mock('@/lib/onboarding/registration-choice', () => ({
  handleRegistrationChoice: vi.fn(),
  isRegistrationCallback: vi.fn().mockReturnValue(false),
  REGISTER_CALLBACK_NO: 'register:no',
  REGISTER_CALLBACK_YES: 'register:yes',
}))
vi.mock('@/lib/onboarding/app-downloaded', () => ({ handleAppDownloaded, isAppDownloadedCallback }))
vi.mock('./correction', () => ({ handleCorrectionFlow, handleCorrectionIntent }))
vi.mock('@/lib/db/leads', () => ({ resetLeadConversation, reviveDeclinedLead: vi.fn() }))
vi.mock('@/lib/messaging/send', () => ({ sendText, sendInlineKeyboard }))
vi.mock('./exit-messages', () => ({ supportRedirect: () => 'support redirect' }))
vi.mock('./ficha-hogar-correction', () => ({
  handleFichaHogarCorrectionFlow,
  detectsFichaHogarCorrectionIntent,
  showFichaHogarCorrectionMenu,
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
  handleCorrectionIntent.mockResolvedValue(false)
  isAppDownloadedCallback.mockReturnValue(false)
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
    detectsFichaHogarCorrectionIntent.mockReturnValue(false)
    const lead = makeLead({ leadStatus: 'code_delivered_registered', currentPhase: 4 })

    await routeMessage(lead, makeInbound({ text: 'sí' }), 'corr-1')

    expect(handleFichaHogar).toHaveBeenCalledWith(lead, 'sí', undefined, 'corr-1')
    expect(scheduleRecontact).toHaveBeenCalledWith('lead-1', 'corr-1')
  })

  it('code_delivered_registered branch: also schedules recontact when a correction menu is shown instead', async () => {
    handleFichaHogarCorrectionFlow.mockResolvedValue(false)
    detectsFichaHogarCorrectionIntent.mockReturnValue(true)
    const lead = makeLead({ leadStatus: 'code_delivered_registered', currentPhase: 4 })

    await routeMessage(lead, makeInbound({ text: 'quiero corregir' }), 'corr-1')

    expect(showFichaHogarCorrectionMenu).toHaveBeenCalledWith(lead)
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
})
