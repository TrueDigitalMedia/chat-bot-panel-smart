/**
 * Ecuador onboarding — end-to-end WhatsApp/Twilio journeys, in-process against the real
 * dev DB (mocked outbound + AI extraction).
 *
 * Exercises the behaviour spec 017 traffic exposed and the 014/015 fixes:
 *  - feature 016: a lead on the Ecuador business number is never asked "¿En qué país…?"
 *  - commit a434a88: conflictOfInterest / every EC NSE button advances instead of looping;
 *                    conflictOfInterest = "Sí" now disqualifies (was a string-compare bug)
 *  - commit 23f15a1: a cantón typed for the provincia is rejected with examples; an
 *                    out-of-catalog province is accepted on the 2nd miss (no hard loop)
 *
 * Explicit assertions on the behaviour that regressed — not a golden-master snapshot.
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'
import { eq } from 'drizzle-orm'

const { outbox, allText, extractionScript, EC_NUMBER, MX_NUMBER, CAM_NUMBER } = vi.hoisted(() => ({
  outbox: [] as { text: string; buttons: string[] }[],
  allText: [] as string[],
  extractionScript: {} as Record<string, unknown>,
  EC_NUMBER: '+15722192733',
  MX_NUMBER: '+525599990000', // test-only placeholder
  CAM_NUMBER: '+19516696845',
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

// Pin the number→country map for the test so it doesn't depend on the local
// WHATSAPP_NUMBER_MAP env (which only carries the real Ecuador number).
vi.mock('@/lib/whatsapp/number-registry', async (orig) => {
  const actual = (await orig()) as Record<string, unknown>
  const map = (id: string | null | undefined) =>
    id === EC_NUMBER ? 'Ecuador' : id === MX_NUMBER ? 'México' : null
  return {
    ...actual,
    countryForSenderId: map,
    countryForPhoneNumberId: map,
    inboundNumberOutcome: (id: string) => (map(id) ? 'scoped' : 'generic'),
  }
})

import { db } from '@/lib/db/client'
import {
  leads, surveyProfiles, flowStates, conversationMessages, consentEvents,
  reEngagementSchedules, systemCallLogs, quotaTargets, quotaRegionCaps, conversationEvals,
} from '@/lib/db/schema'
import { processWhatsAppInbound } from '@/lib/whatsapp/handle-inbound'
import type { ChannelInbound } from '@/types/channel'

async function resetTables() {
  for (const t of [conversationMessages, consentEvents, reEngagementSchedules, flowStates,
    surveyProfiles, systemCallLogs, conversationEvals, leads]) {
    await db.delete(t)
  }
}

let msgId = 0
function sender(user: string, number: string) {
  return async (overrides: Partial<ChannelInbound>, extract: Record<string, unknown> = {}) => {
    for (const k of Object.keys(extractionScript)) delete extractionScript[k]
    Object.assign(extractionScript, extract)
    const inbound: ChannelInbound = {
      channel: 'whatsapp', channelUserId: user, text: '', ...overrides,
      whatsappPhoneNumberId: number,
    }
    await processWhatsAppInbound(inbound, {
      messageSid: `SM${++msgId}`, provider: 'twilio', phoneNumberId: number,
    })
  }
}
const lastText = () => outbox[outbox.length - 1]?.text ?? ''
const turnText = () => outbox.map((o) => o.text).join('\n---\n')
const allJoined = () => allText.join('\n')

// Drive the SHARED_PREFIX up to (and including) the name — country is skipped on the EC number.
async function toName(send: ReturnType<typeof sender>, name: string) {
  await send({ text: 'Hola' })
  await send({ callbackData: 'optin:accept' })
  await send({ callbackData: 'd1:accept' })
  await send({ callbackData: 'reengagement_consent:accept' })
  await send({ callbackData: 'd3:yes' })
  await send({ text: name }, { fullName: name })
}

describe('Ecuador + México onboarding — WhatsApp E2E', () => {
  beforeAll(async () => {
    await db.delete(quotaTargets)
    await db.delete(quotaRegionCaps)
    // open NSE cells so a completed survey can qualify
    const ecRegions = ['Cuenca', 'Guayaquil Norte', 'Guayaquil Sur', 'Quito Norte', 'Quito Sur', 'Sierra']
    const mxRegions = ['GUADALAJARA', 'AMCM', 'MONTERREY', 'CENTRO', 'OCCIDENTE']
    await db.insert(quotaTargets).values([
      ...ecRegions.flatMap((region) =>
        (['AB', 'C', 'D/E'] as const).map((v) => ({
          country: 'Ecuador', region, dimensionType: 'nse' as const,
          dimensionValue: v, targetCount: 500, active: true,
        })),
      ),
      ...mxRegions.flatMap((region) =>
        (['AB', 'C+', 'C', 'D+', 'D/E'] as const).map((v) => ({
          country: 'México', region, dimensionType: 'nse' as const,
          dimensionValue: v, targetCount: 500, active: true,
        })),
      ),
    ])
  })
  beforeEach(async () => {
    outbox.length = 0
    allText.length = 0
    await resetTables()
  })

  it('J1 — full survey to a decision; country never asked; geo validated', async () => {
    const send = sender('+593900000001', EC_NUMBER)
    await toName(send, 'Brenda Montero')

    // 017 + 016: pre-scoped to Ecuador, country question skipped, EC geo label used
    const [lead] = await db.select().from(leads).where(eq(leads.channelUserId, '+593900000001'))
    expect(lead.acquisitionSource).toBe('whatsapp:number:Ecuador')
    expect((await db.select().from(surveyProfiles).where(eq(surveyProfiles.leadId, lead.id)))[0].country).toBe('Ecuador')
    expect(allJoined()).not.toContain('¿En qué país')
    expect(lastText()).toContain('provincia')

    // 23f15a1: cantón typed as provincia → rejected, not persisted
    outbox.length = 0
    await send({ text: 'Cuenca' }, { stateProvince: 'Cuenca' }) // Cuenca is a cantón, not a provincia
    expect(turnText()).toContain('No reconocí esa provincia')
    expect((await db.select().from(surveyProfiles).where(eq(surveyProfiles.leadId, lead.id)))[0].stateProvince).not.toBe('Cuenca')

    outbox.length = 0
    await send({ text: 'Azuay' }, { stateProvince: 'Azuay' })
    expect(lastText()).toContain('cantón')
    await send({ text: 'Cuenca' }, { municipality: 'Cuenca' })
    await send({ text: 'El Sagrario' }, { neighborhood: 'El Sagrario' })
    await send({ text: 'brenda@example.com' }, { email: 'brenda@example.com' })
    await send({ callbackData: 'gender:Femenino' })
    await send({ text: '33' }, { age: 33 })

    // a434a88: the screening + all 8 NSE buttons advance (were routing to the AI handler)
    await send({ callbackData: 'conflictOfInterest:false' })
    await send({ callbackData: 'healthInsurancePsh:IESS' })
    await send({ callbackData: 'monthlyIncome:De $701 hasta $1.000' })
    await send({ callbackData: 'dwellingFinishes:Casa de Cemento/Ladrillo Techo de Loza o Teja' })
    await send({ callbackData: 'floorMaterial:Cerámica, baldosa, vinil o marmetón' })
    await send({ callbackData: 'vehicleCount:1' })
    await send({ callbackData: 'occupationHead:Empleados de oficina' })
    await send({ callbackData: 'occupationAma:Empleados de oficina' })
    await send({ callbackData: 'educationPsh:Universidad completa' })
    await send({ callbackData: 'householdSize:3' })
    await send({ callbackData: 'isPregnant:false' })
    await send({ callbackData: 'hasBabyUnder3:false' })
    await send({ callbackData: 'internetAccess:Internet Hogar contratado (cable)' })
    await send({ callbackData: 'shoppingFrequency:Semanal' })
    await send({ text: '1, 2' }, { shoppingCategories: [1, 2] })
    await send({ callbackData: 'contactChannel:WhatsApp' })
    await send({ callbackData: 'contactSchedule:Tarde (13-17hs)' })

    const [fl] = await db.select().from(leads).where(eq(leads.id, lead.id))
    const [fp] = await db.select().from(surveyProfiles).where(eq(surveyProfiles.leadId, lead.id))
    // the survey ran to completion — a real decision, never stuck mid-flow
    expect([
      'link_sent', 'waiting_for_code', 'code_delivered_registered',
      'code_delivered_not_registered', 'code_delivered_no_response',
      'not_qualified', 'quota_exhausted',
    ]).toContain(fl.leadStatus)
    expect(fp.country).toBe('Ecuador')
    expect(fp.stateProvince).toBe('Azuay')
    expect(fp.nsePoints).not.toBeNull()
    expect(fp.conflictOfInterest).toBe(false)
    expect(allJoined()).not.toContain('¿En qué país')
  }, 180_000)

  it('J2 — conflictOfInterest = "Sí" disqualifies the lead', async () => {
    const send = sender('+593900000002', EC_NUMBER)
    await toName(send, 'Juan Díaz')
    await send({ text: 'Pichincha' }, { stateProvince: 'Pichincha' })
    await send({ text: 'Mejía' }, { municipality: 'Mejía' })
    await send({ text: 'Machachi' }, { neighborhood: 'Machachi' })
    await send({ text: 'juan@example.com' }, { email: 'juan@example.com' })
    await send({ callbackData: 'gender:Masculino' })
    await send({ text: '40' }, { age: 40 })
    await send({ callbackData: 'conflictOfInterest:true' })

    const [fl] = await db.select().from(leads).where(eq(leads.channelUserId, '+593900000002'))
    expect(fl.leadStatus).toBe('not_qualified')
    expect(fl.statusReason).toBe('sensitive_industry')
  }, 90_000)

  it('J3 — out-of-catalog province: rejected once, then accepted (no hard loop)', async () => {
    const send = sender('+593900000003', EC_NUMBER)
    await toName(send, 'Ana Coba')
    // Napo (Amazon) is not in the NSE sample catalog
    outbox.length = 0
    await send({ text: 'Napo' }, { stateProvince: 'Napo' })
    expect(turnText()).toContain('No reconocí esa provincia') // 1st miss → help + re-ask
    const [p1] = await db.select().from(surveyProfiles).where(eq(surveyProfiles.leadId,
      (await db.select().from(leads).where(eq(leads.channelUserId, '+593900000003')))[0].id))
    expect(p1.stateProvince).not.toBe('Napo')

    outbox.length = 0
    await send({ text: 'Napo' }, { stateProvince: 'Napo' }) // 2nd miss → accept raw, advance
    const [lead] = await db.select().from(leads).where(eq(leads.channelUserId, '+593900000003'))
    const [p2] = await db.select().from(surveyProfiles).where(eq(surveyProfiles.leadId, lead.id))
    expect(p2.stateProvince).toBe('Napo')
    expect(lastText()).toContain('cantón') // advanced past provincia, not looping
  }, 90_000)

  it('J4 — a lead on the generic (CAM) number IS still asked their country', async () => {
    const send = sender('+50700000004', CAM_NUMBER)
    await send({ text: 'Hola' })
    await send({ callbackData: 'optin:accept' })
    await send({ callbackData: 'd1:accept' })
    await send({ callbackData: 'reengagement_consent:accept' })
    await send({ callbackData: 'd3:yes' })
    await send({ text: 'Carlos Ruiz' }, { fullName: 'Carlos Ruiz' })
    await send({ callbackData: 'gps:manual' }) // opt out of GPS → reach the country question

    const [lead] = await db.select().from(leads).where(eq(leads.channelUserId, '+50700000004'))
    expect(lead.acquisitionSource).toBeNull()
    expect((await db.select().from(surveyProfiles).where(eq(surveyProfiles.leadId, lead.id)))[0].country).toBeNull()
    expect(allJoined()).toContain('¿En qué país')
  }, 90_000)

  it('J5 — México: scoped by number, estado/municipio validated, full survey to a decision', async () => {
    const send = sender('+525533330005', MX_NUMBER)
    await toName(send, 'Lucía Mendoza')

    const [lead] = await db.select().from(leads).where(eq(leads.channelUserId, '+525533330005'))
    expect(lead.acquisitionSource).toBe('whatsapp:number:México')
    expect((await db.select().from(surveyProfiles).where(eq(surveyProfiles.leadId, lead.id)))[0].country).toBe('México')
    expect(allJoined()).not.toContain('¿En qué país')
    expect(lastText()).toContain('estado') // México geo label, not "provincia"

    // 23f15a1: a municipio typed as an estado is rejected with examples
    outbox.length = 0
    await send({ text: 'Guadalajara' }, { stateProvince: 'Guadalajara' }) // a municipio, not an estado
    expect(turnText()).toContain('No reconocí esa provincia')
    expect((await db.select().from(surveyProfiles).where(eq(surveyProfiles.leadId, lead.id)))[0].stateProvince).not.toBe('Guadalajara')

    outbox.length = 0
    await send({ text: 'Jalisco' }, { stateProvince: 'Jalisco' })
    expect(lastText()).toMatch(/municipio|alcald/i)
    await send({ text: 'Guadalajara' }, { municipality: 'Guadalajara' })
    await send({ text: 'Americana' }, { neighborhood: 'Americana' })
    await send({ text: 'lucia@example.com' }, { email: 'lucia@example.com' })
    await send({ callbackData: 'gender:Femenino' })
    await send({ text: '35' }, { age: 35 })

    // a434a88: conflictOfInterest + the México NSE buttons advance
    await send({ callbackData: 'conflictOfInterest:false' })
    await send({ callbackData: 'educationHoh:Licenciatura completa' })
    await send({ callbackData: 'fullBathrooms:2 o más' })
    await send({ callbackData: 'vehicleCount:1' })
    await send({ callbackData: 'homeInternet:Sí tiene' })
    await send({ callbackData: 'workers14Plus:2' })
    await send({ callbackData: 'bedrooms:3' })
    await send({ callbackData: 'householdSize:4' })
    await send({ callbackData: 'isPregnant:false' })
    await send({ callbackData: 'hasBabyUnder3:false' })
    await send({ text: '44100' }, { codigoPostal: '44100' })
    await send({ callbackData: 'shoppingFrequency:Semanal' })
    await send({ text: '1, 2' }, { shoppingCategories: [1, 2] })
    await send({ callbackData: 'contactChannel:WhatsApp' })
    await send({ callbackData: 'contactSchedule:Tarde (13-17hs)' })

    const [fl] = await db.select().from(leads).where(eq(leads.id, lead.id))
    const [fp] = await db.select().from(surveyProfiles).where(eq(surveyProfiles.leadId, lead.id))
    expect([
      'link_sent', 'waiting_for_code', 'code_delivered_registered',
      'code_delivered_not_registered', 'code_delivered_no_response',
      'not_qualified', 'quota_exhausted',
    ]).toContain(fl.leadStatus)
    expect(fp.country).toBe('México')
    expect(fp.stateProvince).toBe('Jalisco')
    expect(fp.nsePoints).not.toBeNull()
    expect(fp.conflictOfInterest).toBe(false)
  }, 180_000)
})
