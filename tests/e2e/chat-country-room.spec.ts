import { test, expect, type APIRequestContext } from '@playwright/test'
import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { leads, surveyProfiles } from '@/lib/db/schema'

// Feature 016 — real (non-mock) chat-web flow, same convention as web-chat.spec.ts: each
// test reuses one Playwright `request` context so the web_session_id cookie persists.
// These run against the live /api/chat/web endpoint (Node request, no browser) and check
// the resulting DB rows directly.

async function completeToSurvey(request: APIRequestContext): Promise<void> {
  await request.post('/api/chat/web', { data: { callbackData: 'optin:accept', label: 'Inscribirme' } })
  await request.post('/api/chat/web', { data: { callbackData: 'd1:accept', label: 'Confirmo y acepto' } })
  await request.post('/api/chat/web', { data: { callbackData: 'reengagement_consent:accept', label: 'Sí, autorizo' } })
  await request.post('/api/chat/web', { data: { callbackData: 'd3:yes', label: 'Sí' } })
  await request.post('/api/chat/web', { data: { text: '+525512345678' } })
}

function outboundBodies(body: { messages: { direction: string; body: string }[] }): string[] {
  return body.messages.filter((m) => m.direction === 'out').map((m) => m.body)
}

async function leadRowForSession(leadId: string) {
  const [row] = await db
    .select({
      channel: leads.channel,
      acquisitionSource: leads.acquisitionSource,
      country: surveyProfiles.country,
    })
    .from(leads)
    .innerJoin(surveyProfiles, eq(surveyProfiles.leadId, leads.id))
    .where(eq(leads.id, leadId))
    .limit(1)
  return row
}

test.describe('Chat country room — part 1 (T016): fresh visitor is scoped, country never asked', () => {
  test('/chat/ecuador → country pre-set, country question never shown, next question is Ecuador geo', async ({
    request,
  }) => {
    const boot = await request.get('/api/chat/web?room=ecuador')
    expect(boot.status()).toBe(200)
    const bootBody = await boot.json()
    const leadId: string = bootBody.leadId
    // Bootstrap response is unchanged — still the opt-in message.
    expect(outboundBodies(bootBody).join('\n')).toContain('inscribirte' /* opt-in */)

    // Room applied at bootstrap, before the survey even starts.
    expect(await leadRowForSession(leadId)).toMatchObject({
      channel: 'web',
      acquisitionSource: 'web:room:Ecuador',
      country: 'Ecuador',
    })

    await completeToSurvey(request)
    const afterName = await request.post('/api/chat/web', { data: { text: 'María Pérez' } })
    expect(afterName.status()).toBe(200)
    const bodies = outboundBodies(await afterName.json())

    // The country question is never asked; the first geo question uses Ecuador wording.
    expect(bodies.join('\n')).not.toContain('¿En qué país te encuentras?')
    expect(bodies.join('\n')).toContain('provincia') // "¿En qué provincia vives?"
  })

  test('/chat/mexico → country = México, México geo wording', async ({ request }) => {
    const boot = await request.get('/api/chat/web?room=mexico')
    const leadId: string = (await boot.json()).leadId
    expect(await leadRowForSession(leadId)).toMatchObject({
      acquisitionSource: 'web:room:México',
      country: 'México',
    })

    await completeToSurvey(request)
    const afterName = await request.post('/api/chat/web', { data: { text: 'María Pérez' } })
    const bodies = outboundBodies(await afterName.json()).join('\n')
    expect(bodies).not.toContain('¿En qué país te encuentras?')
    expect(bodies).toContain('estado') // "¿En qué estado vives?"
  })

  test('bare /chat → the country question IS shown with all buttons', async ({ request }) => {
    await request.get('/api/chat/web')
    await completeToSurvey(request)
    await request.post('/api/chat/web', { data: { text: 'Juan Gómez' } })
    // A non-scoped web lead hits the GPS gate at Q2 first; opting into manual entry then
    // reaches the country question (the room flow skips both — needsGpsCapture is false
    // and country is pre-answered).
    const afterManual = await request.post('/api/chat/web', { data: { callbackData: 'gps:manual', label: 'Escribir ubicación' } })
    const body = await afterManual.json()
    const countryMsg = body.messages.find((m: { body: string }) => m.body.includes('¿En qué país te encuentras?'))
    expect(countryMsg).toBeTruthy()
    const labels = (countryMsg.meta?.buttons ?? []).map((b: { text: string }) => b.text)
    expect(labels).toEqual(expect.arrayContaining(['Guatemala', 'Ecuador', 'México']))
  })

  test('/chat/guatemala (not a room) degrades — country still asked, no acquisition_source', async ({
    request,
  }) => {
    const boot = await request.get('/api/chat/web?room=guatemala')
    const leadId: string = (await boot.json()).leadId
    expect(await leadRowForSession(leadId)).toMatchObject({ acquisitionSource: null, country: null })

    await completeToSurvey(request)
    await request.post('/api/chat/web', { data: { text: 'Ana López' } })
    const afterManual = await request.post('/api/chat/web', { data: { callbackData: 'gps:manual', label: 'Escribir ubicación' } })
    expect(outboundBodies(await afterManual.json()).join('\n')).toContain('¿En qué país te encuentras?')
  })
})

test.describe('Chat country room — part 2 (T018): existing conversation is never re-scoped', () => {
  test('reopening /chat/ecuador resumes, stays Ecuador, no opening message re-sent', async ({ request }) => {
    const boot = await request.get('/api/chat/web?room=ecuador')
    const leadId: string = (await boot.json()).leadId
    await request.post('/api/chat/web', { data: { callbackData: 'optin:accept', label: 'Inscribirme' } })

    const reload = await request.get('/api/chat/web?room=ecuador')
    const body = await reload.json()
    const optInCount = outboundBodies(body).filter((b) => b.includes('inscribirte')).length
    expect(optInCount).toBe(1) // not re-sent
    expect((await leadRowForSession(leadId)).country).toBe('Ecuador')
  })

  test('opening bare /chat on an Ecuador-room conversation does not re-scope it', async ({ request }) => {
    const boot = await request.get('/api/chat/web?room=ecuador')
    const leadId: string = (await boot.json()).leadId
    await request.post('/api/chat/web', { data: { callbackData: 'optin:accept', label: 'Inscribirme' } })

    await request.get('/api/chat/web') // bare
    expect((await leadRowForSession(leadId)).country).toBe('Ecuador')
  })

  test('opening /chat/mexico on an Ecuador-room conversation does not re-scope it', async ({ request }) => {
    const boot = await request.get('/api/chat/web?room=ecuador')
    const leadId: string = (await boot.json()).leadId
    await request.post('/api/chat/web', { data: { callbackData: 'optin:accept', label: 'Inscribirme' } })

    await request.get('/api/chat/web?room=mexico')
    expect((await leadRowForSession(leadId)).country).toBe('Ecuador')
    expect((await leadRowForSession(leadId)).acquisitionSource).toBe('web:room:Ecuador')
  })

  test('a second GET ?room=ecuador on a brand-new-but-now-scoped lead is idempotent (branch 2)', async ({
    request,
  }) => {
    const boot = await request.get('/api/chat/web?room=ecuador')
    const leadId: string = (await boot.json()).leadId
    // No turn yet — but country is already set, so a second room GET must no-op.
    await request.get('/api/chat/web?room=mexico')
    expect((await leadRowForSession(leadId)).country).toBe('Ecuador')
  })
})
