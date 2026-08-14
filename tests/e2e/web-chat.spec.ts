import { test, expect } from '@playwright/test'

// Real (non-mock) chat web flow — requires a running dev server with a real Postgres DB
// (same convention as tests/e2e/quota-check-real.spec.ts). Each `test()` here reuses the
// same Playwright `request` context so the web_session_id cookie persists across calls
// within that test, exactly like a visitor's browser would (spec 012).

test.describe('Chat web — bootstrap and first turn (US1)', () => {
  test('GET bootstraps a new session and sends the same opt-in Telegram sends a new user', async ({
    request,
  }) => {
    const res = await request.get('/api/chat/web')
    expect(res.status()).toBe(200)
    expect(res.headers()['set-cookie']).toMatch(/web_session_id=/)

    const body = await res.json()
    expect(body).toHaveProperty('leadId')
    expect(body).toHaveProperty('leadStatus')
    expect(Array.isArray(body.messages)).toBe(true)
    expect(body.messages.length).toBeGreaterThan(0)

    const first = body.messages[0]
    expect(first.direction).toBe('out')
    expect(first.body).toContain('inscribirte en PanelSmart')
  })

  test('POST optin:accept advances the flow to D1 (Términos y Condiciones)', async ({ request }) => {
    await request.get('/api/chat/web') // bootstrap first (creates the session cookie)

    const res = await request.post('/api/chat/web', {
      data: { callbackData: 'optin:accept', label: 'Inscribirme' },
    })
    expect(res.status()).toBe(200)

    const body = await res.json()
    expect(body.messages.length).toBeGreaterThan(0)
    expect(body.messages[0].body).toContain('Términos y Condiciones')
  })

  test('rejects a body with neither text, callbackData, nor location', async ({ request }) => {
    await request.get('/api/chat/web')
    const res = await request.post('/api/chat/web', { data: {} })
    expect(res.status()).toBe(400)
  })

  test('rejects a body with more than one of text/callbackData/location', async ({ request }) => {
    await request.get('/api/chat/web')
    const res = await request.post('/api/chat/web', {
      data: { text: 'hola', callbackData: 'optin:accept' },
    })
    expect(res.status()).toBe(400)
  })
})

test.describe('Chat web — resuming a session (US2)', () => {
  test('a second GET with the same session cookie returns full history without re-sending the opt-in', async ({
    request,
  }) => {
    await request.get('/api/chat/web') // first visit — triggers opt-in
    await request.post('/api/chat/web', { data: { callbackData: 'optin:accept', label: 'Inscribirme' } })

    const reload = await request.get('/api/chat/web')
    expect(reload.status()).toBe(200)
    const body = await reload.json()

    const outboundBodies = body.messages.filter((m: { direction: string }) => m.direction === 'out').map((m: { body: string }) => m.body)
    const optInCount = outboundBodies.filter((b: string) => b.includes('inscribirte en PanelSmart')).length
    expect(optInCount).toBe(1) // present once from the first visit, not re-triggered on reload

    const inboundCount = body.messages.filter((m: { direction: string }) => m.direction === 'in').length
    expect(inboundCount).toBeGreaterThanOrEqual(1) // the optin:accept click is preserved in history
  })
})

test.describe('Chat web — location gate (US3)', () => {
  test('reaching the GPS gate offers a location_request, and posting coordinates advances the flow', async ({
    request,
  }) => {
    await request.get('/api/chat/web')
    await request.post('/api/chat/web', { data: { callbackData: 'optin:accept', label: 'Inscribirme' } })
    await request.post('/api/chat/web', { data: { callbackData: 'd1:accept', label: 'Confirmo y acepto' } })
    await request.post('/api/chat/web', { data: { callbackData: 'reengagement_consent:accept', label: 'Sí, autorizo' } })
    const afterD3 = await request.post('/api/chat/web', { data: { callbackData: 'd3:yes', label: 'Sí' } })
    expect(afterD3.status()).toBe(200)
    const afterD3Body = await afterD3.json()
    expect(afterD3Body.messages[0].body).toContain('teléfono')

    const afterPhone = await request.post('/api/chat/web', { data: { text: '+50255551234' } })
    expect(afterPhone.status()).toBe(200)

    const afterName = await request.post('/api/chat/web', { data: { text: 'Juana Pérez' } })
    expect(afterName.status()).toBe(200)
    const afterNameBody = await afterName.json()
    const locationRequest = afterNameBody.messages.find(
      (m: { meta: { type?: string } | null }) => m.meta?.type === 'location_request',
    )
    expect(locationRequest).toBeTruthy()

    // Real reverse-geocoding call (Nominatim) — tolerant of network variability, same
    // style as tests/e2e/quota-check-real.spec.ts: we assert the endpoint accepted the
    // location and responded without crashing, not the exact geocoded content.
    const afterLocation = await request.post('/api/chat/web', {
      data: { location: { latitude: 14.6349, longitude: -90.5069 } },
    })
    expect(afterLocation.status()).toBe(200)
    const afterLocationBody = await afterLocation.json()
    expect(Array.isArray(afterLocationBody.messages)).toBe(true)
  })
})
