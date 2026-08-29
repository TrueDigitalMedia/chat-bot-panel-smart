import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * End-to-end guard for the "Ya la descargué" → code delivered → freeze armed chain,
 * exercising the REAL app-downloaded.ts, request-registration-code.ts and
 * deliver-registration-code.ts together (only leaf deps — DB, transport, state-machine,
 * schedulers, env — are mocked). Locks in the post-refactor behaviour:
 *   - no "Estamos generando tu código…" acknowledgement
 *   - the code goes out on its own message first, then instructions + buttons
 *   - the lead transitions to waiting_for_code and the 20h inactivity freeze is armed
 */

const {
  sendText,
  sendVideo,
  sendInlineKeyboard,
  sendTemplateOrKeyboard,
  sendTemplateOrText,
  transitionLead,
  scheduleFreezeRegistration,
  cancelPendingJobs,
  scheduleJob,
  dbUpdate,
} = vi.hoisted(() => ({
  sendText: vi.fn(),
  sendVideo: vi.fn(),
  sendInlineKeyboard: vi.fn(),
  sendTemplateOrKeyboard: vi.fn(),
  sendTemplateOrText: vi.fn(),
  transitionLead: vi.fn(),
  scheduleFreezeRegistration: vi.fn(),
  cancelPendingJobs: vi.fn(),
  scheduleJob: vi.fn(),
  dbUpdate: vi.fn(),
}))

vi.mock('@/lib/messaging/send', () => ({
  sendText,
  sendVideo,
  sendInlineKeyboard,
  sendTemplateOrKeyboard,
  sendTemplateOrText,
}))
vi.mock('@/lib/state-machine', () => ({ transitionLead }))
vi.mock('@/lib/scheduler/registration-freeze', () => ({ scheduleFreezeRegistration }))
vi.mock('@/lib/scheduler/re-engagement', () => ({ cancelPendingJobs, scheduleJob }))
vi.mock('@/lib/db/client', () => ({ db: { update: dbUpdate } }))
vi.mock('@/lib/env', () => ({
  env: { REGISTRATION_CODE_MOCK_ENABLED: true, TDM_REGISTRATION_CODE_TIMEOUT_SECONDS: 1800, TDM_TEST_MODE_ENABLED: false },
  isTdmRegistrationRequestConfigured: () => false,
}))

import { handleAppDownloaded } from './app-downloaded'
import type { Lead } from '@/types/lead'

function makeLead(overrides: Partial<Lead> = {}): Lead {
  return {
    id: 'lead-1',
    channel: 'telegram',
    channelUserId: '123',
    phoneNumber: null,
    leadStatus: 'link_sent',
    currentPhase: 2,
    ...overrides,
  } as unknown as Lead
}

beforeEach(() => {
  vi.resetAllMocks()
  dbUpdate.mockReturnValue({ set: () => ({ where: () => Promise.resolve() }) })
  transitionLead.mockResolvedValue(undefined)
  scheduleFreezeRegistration.mockResolvedValue(undefined)
  cancelPendingJobs.mockResolvedValue(undefined)
})

describe('registration flow — "Ya la descargué" through to code delivery (mock code)', () => {
  it('does not send the "Estamos generando tu código…" acknowledgement anymore', async () => {
    await handleAppDownloaded(makeLead(), 'corr-1')

    for (const call of sendText.mock.calls) {
      expect(String(call[1])).not.toContain('Estamos generando')
    }
  })

  it('delivers the code on its own message, then the instructions + confirm buttons', async () => {
    await handleAppDownloaded(makeLead(), 'corr-1')

    // 1. code, alone
    expect(sendText).toHaveBeenCalledTimes(1)
    const codeMsg = String(sendText.mock.calls[0][1])
    expect(codeMsg).toContain('Tu código de registro')
    expect(codeMsg).toContain('MOCK-')
    expect(codeMsg).not.toContain('Pasos para registrarte')

    // 2. instructions + buttons, as a separate message
    expect(sendInlineKeyboard).toHaveBeenCalledTimes(1)
    const [, instrText, buttons] = sendInlineKeyboard.mock.calls[0]
    expect(String(instrText)).toContain('Pasos para registrarte')
    expect(String(instrText)).not.toContain('MOCK-')
    expect(buttons).toEqual([
      [{ text: '✅ Ya me registré', callback_data: 'register:yes' }],
      [{ text: '❌ No pude registrarme', callback_data: 'register:no' }],
    ])

    // ordering: code before instructions
    expect(sendText.mock.invocationCallOrder[0]).toBeLessThan(sendInlineKeyboard.mock.invocationCallOrder[0])
  })

  it('transitions the lead to waiting_for_code and arms the inactivity freeze', async () => {
    await handleAppDownloaded(makeLead(), 'corr-1')

    expect(cancelPendingJobs).toHaveBeenCalledWith('lead-1', 2)
    expect(transitionLead).toHaveBeenCalledWith('lead-1', 'waiting_for_code', expect.any(String), 'corr-1')
    expect(scheduleFreezeRegistration).toHaveBeenCalledWith('lead-1', 2)
  })

  it('is a no-op reply when the step is no longer pending', async () => {
    await handleAppDownloaded(makeLead({ leadStatus: 'waiting_for_code' }), 'corr-1')

    expect(sendText).toHaveBeenCalledWith(expect.anything(), 'Este paso ya no está pendiente.')
    expect(transitionLead).not.toHaveBeenCalled()
    expect(scheduleFreezeRegistration).not.toHaveBeenCalled()
  })
})
