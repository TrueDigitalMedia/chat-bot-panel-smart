/**
 * Ecuador onboarding — full WhatsApp/Twilio journey, in-process against the real dev DB.
 *
 * Exercises the three fixes that spec 017 traffic exposed:
 *  - feature 016: a lead on the Ecuador business number is never asked "¿En qué país…?"
 *  - commit a434a88: conflictOfInterest (and every EC NSE button) advances instead of looping
 *  - commit 23f15a1: "Guayaquil" typed for the provincia is rejected with examples; the
 *    real provincia "Guayas" is then accepted
 *
 * Not a golden-master snapshot — explicit assertions on the behaviour that regressed.
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'
import { eq } from 'drizzle-orm'

const { outbox, allText, extractionScript } = vi.hoisted(() => ({
  outbox: [] as { text: string; buttons: string[] }[],
  allText: [] as string[],
  extractionScript: {} as Record<string, unknown>,
}))

vi.mock('@/lib/whatsapp/send', () => {
  const push = (text: string, buttons: string[] = []) => {
    outbox.push({ text, buttons })
    allText.push(text)
  }
  return {
    sendWhatsAppText: vi.fn(async (_to: string, text: string) => (push(text), 'sid')),
    sendWhatsAppVideo: vi.fn(async (_to: string, _v: string, caption?: string) => (push(caption ?? ''), 'sid')),
    sendWhatsAppKeyboard: vi.fn(async (_to: string, text: string, b: { text: string; callback_data?: string }[][]) => {
      push(text, b.flat().map((x) => x.callback_data ?? x.text))
      return { sid: 'sid', choices: {} }
    }),
    sendWhatsAppTemplateOrKeyboard: vi.fn(
      async (_to: string, _l: string, text: string, b: { text: string; callback_data?: string }[][]) => {
        push(text, b.flat().map((x) => x.callback_data ?? x.text))
        return { sid: 'sid', choices: {} }
      },
    ),
    sendWhatsAppTemplateOrText: vi.fn(async (_to: string, _l: string, text: string) => (push(text), 'sid')),
  }
})

vi.mock('@/lib/ai/extract-survey-fields', () => ({
  extractField: vi.fn(async (fieldName: string) =>
    fieldName in extractionScript
      ? { ok: true as const, value: extractionScript[fieldName], correlationId: 'test' }
      : { ok: false as const, correlationId: 'test' },
  ),
}))
vi.mock('@/lib/ai/sanitize', () => ({ sanitizeUserText: (s: string) => s, sanitizeForLog: (s: string) => s }))
vi.mock('@/lib/tdm-registration/oauth', () => ({ getTdmAccessToken: vi.fn(async () => 'tok') }))

import { db } from '@/lib/db/client'
import {
  leads, surveyProfiles, flowStates, conversationMessages, consentEvents,
  reEngagementSchedules, systemCallLogs, quotaTargets, quotaRegionCaps, conversationEvals,
} from '@/lib/db/schema'
import { processWhatsAppInbound } from '@/lib/whatsapp/handle-inbound'
import type { ChannelInbound } from '@/types/channel'

const EC_NUMBER = '+15722192733'
const USER = '+593999000111'

async function resetTables() {
  for (const t of [conversationMessages, consentEvents, reEngagementSchedules, flowStates,
    surveyProfiles, systemCallLogs, conversationEvals, leads]) {
    await db.delete(t)
  }
}

let msgId = 0
async function send(overrides: Partial<ChannelInbound>, extract: Record<string, unknown> = {}) {
  for (const k of Object.keys(extractionScript)) delete extractionScript[k]
  Object.assign(extractionScript, extract)
  const inbound: ChannelInbound = {
    channel: 'whatsapp', channelUserId: USER, text: '', ...overrides,
    whatsappPhoneNumberId: EC_NUMBER,
  }
  await processWhatsAppInbound(inbound, { messageSid: `SM${++msgId}`, provider: 'twilio', phoneNumberId: EC_NUMBER })
}

const lastText = () => outbox[outbox.length - 1]?.text ?? ''
const transcript = () => outbox.map((o) => o.text).join('\n---\n')

describe('Ecuador onboarding — full WhatsApp journey', () => {
  beforeAll(async () => {
    await db.delete(quotaTargets)
    await db.delete(quotaRegionCaps)
    // open NSE cells so the lead can qualify regardless of computed NSE band
    await db.insert(quotaTargets).values(
      (['AB', 'C', 'D/E'] as const).map((v) => ({
        country: 'Ecuador', region: 'Guayaquil Sur', dimensionType: 'nse' as const,
        dimensionValue: v, targetCount: 100, active: true,
      })),
    )
  })
  beforeEach(async () => {
    outbox.length = 0
    allText.length = 0
    await resetTables()
  })

  it('scopes to Ecuador, never asks country, validates geo, and does not loop on NSE buttons', async () => {
    await send({ text: 'Hola' })
    // 017: lead pre-scoped to Ecuador at creation
    const [lead0] = await db.select().from(leads).where(eq(leads.channelUserId, USER))
    expect(lead0.whatsappPhoneNumberId).toBe(EC_NUMBER)
    expect(lead0.acquisitionSource).toBe('whatsapp:number:Ecuador')
    const [p0] = await db.select().from(surveyProfiles).where(eq(surveyProfiles.leadId, lead0.id))
    expect(p0.country).toBe('Ecuador')

    await send({ callbackData: 'optin:accept' })
    await send({ callbackData: 'd1:accept' })
    await send({ callbackData: 'reengagement_consent:accept' })
    await send({ callbackData: 'd3:yes' })
    await send({ text: 'Brenda Montero' }, { fullName: 'Brenda Montero' })

    // 016: country question never shown; first geo prompt uses the Ecuador label
    expect(transcript()).not.toContain('¿En qué país')
    expect(lastText()).toContain('provincia')

    // 23f15a1: a cantón typed as a provincia is rejected with examples (then the
    // question is re-asked, so check the whole turn's output, not just the last line)
    outbox.length = 0
    await send({ text: 'Guayaquil' }, { stateProvince: 'Guayaquil' })
    expect(transcript()).toContain('No reconocí esa provincia')
    expect(transcript()).toContain('Ejemplos:')
    const [pStuck] = await db.select().from(surveyProfiles).where(eq(surveyProfiles.leadId, lead0.id))
    expect(pStuck.stateProvince).not.toBe('Guayaquil') // not persisted

    // the real provincia is accepted and the survey advances to the cantón
    outbox.length = 0
    await send({ text: 'Guayas' }, { stateProvince: 'Guayas' })
    expect(lastText()).toContain('cantón')

    await send({ text: 'Guayaquil' }, { municipality: 'Guayaquil' })
    await send({ text: 'Tarqui' }, { neighborhood: 'Tarqui' })
    await send({ text: 'brenda@example.com' }, { email: 'brenda@example.com' })
    await send({ callbackData: 'gender:Femenino' })
    await send({ text: '33' }, { age: 33 })

    // a434a88: the conflictOfInterest button advances the survey — before the fix it
    // routed to the AI handler and re-asked the same question forever
    const idxBefore = (await db.select().from(leads).where(eq(leads.id, lead0.id)))[0].surveyQuestionIndex
    outbox.length = 0
    await send({ callbackData: 'conflictOfInterest:false' })
    const idxAfter = (await db.select().from(leads).where(eq(leads.id, lead0.id)))[0].surveyQuestionIndex
    expect(idxAfter).toBeGreaterThan(idxBefore)
    expect(transcript()).not.toContain('agencia de publicidad') // the conflict question text

    // and a couple of the Ecuador NSE buttons also advance (same BUTTON_PREFIXES fix)
    outbox.length = 0
    await send({ callbackData: 'healthInsurancePsh:IESS' })
    const idxNse1 = (await db.select().from(leads).where(eq(leads.id, lead0.id)))[0].surveyQuestionIndex
    expect(idxNse1).toBeGreaterThan(idxAfter)
    await send({ callbackData: 'monthlyIncome:De $701 hasta $1.000' })
    const idxNse2 = (await db.select().from(leads).where(eq(leads.id, lead0.id)))[0].surveyQuestionIndex
    expect(idxNse2).toBeGreaterThan(idxNse1)

    const [finalProfile] = await db.select().from(surveyProfiles).where(eq(surveyProfiles.leadId, lead0.id))
    expect(finalProfile.country).toBe('Ecuador')
    expect(finalProfile.stateProvince).toBe('Guayas')
    expect(finalProfile.conflictOfInterest).toBe(false)
    // country question was never asked anywhere in the whole conversation
    expect(allText.join('\n')).not.toContain('¿En qué país')
  }, 120_000)
})
