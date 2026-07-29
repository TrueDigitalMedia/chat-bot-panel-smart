import { describe, it, expect, vi, afterEach } from 'vitest'

vi.mock('@/lib/env', () => ({
  env: { PANEL_SMART_SYNC_URL: 'https://kantar-sendleads-fxapp.example/api/ai-lead-responses' },
  isPanelSmartSyncConfigured: () => true,
}))

vi.mock('@/lib/tdm-registration/oauth', () => ({
  getTdmAccessToken: vi.fn(async () => 'token-abc'),
}))

import { syncToPanelSmart, requirePanelSmartSyncConfigured } from './client'

describe('syncToPanelSmart', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('POSTs the payload with a Bearer token from the shared TDM OAuth flow', async () => {
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      expect(init.method).toBe('POST')
      expect(init.headers).toEqual({
        'Content-Type': 'application/json',
        Authorization: 'Bearer token-abc',
      })
      expect(JSON.parse(init.body as string)).toEqual({
        lead_id: 'lead-1',
        responses: [{ codigo_pregunta: 'cars', pregunta: '¿Cuántos autos?', respuesta: '2' }],
      })
      return new Response('', { status: 200 })
    })
    vi.stubGlobal('fetch', fetchMock)

    await syncToPanelSmart({
      lead_id: 'lead-1',
      responses: [{ codigo_pregunta: 'cars', pregunta: '¿Cuántos autos?', respuesta: '2' }],
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('throws on a non-2xx response', async () => {
    const fetchMock = vi.fn(async () => new Response('server error', { status: 500 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(syncToPanelSmart({ lead_id: 'lead-1', responses: [] })).rejects.toThrow(
      /Panel Smart sync failed: 500/,
    )
  })
})

describe('requirePanelSmartSyncConfigured', () => {
  it('does not throw when configured', () => {
    expect(() => requirePanelSmartSyncConfigured()).not.toThrow()
  })
})
