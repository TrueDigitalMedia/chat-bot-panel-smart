import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@/lib/env', () => ({
  env: {
    TDM_OAUTH_TOKEN_URL: 'https://login.microsoftonline.com/tenant-id/oauth2/v2.0/token',
    TDM_OAUTH_CLIENT_ID: 'client-id',
    TDM_OAUTH_CLIENT_SECRET: 'client-secret',
    TDM_OAUTH_SCOPE: 'api://tdm-app-id/.default',
  },
}))

import { getTdmAccessToken, resetTdmAccessTokenCache } from './oauth'

describe('getTdmAccessToken', () => {
  beforeEach(() => {
    resetTdmAccessTokenCache()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('POSTs client_credentials as x-www-form-urlencoded and returns the access token', async () => {
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      expect(init.method).toBe('POST')
      expect(init.headers).toEqual({ 'Content-Type': 'application/x-www-form-urlencoded' })
      const body = new URLSearchParams(init.body as string)
      expect(body.get('client_id')).toBe('client-id')
      expect(body.get('client_secret')).toBe('client-secret')
      expect(body.get('scope')).toBe('api://tdm-app-id/.default')
      expect(body.get('grant_type')).toBe('client_credentials')
      return new Response(JSON.stringify({ access_token: 'token-abc', expires_in: 3600 }), { status: 200 })
    })
    vi.stubGlobal('fetch', fetchMock)

    const token = await getTdmAccessToken()
    expect(token).toBe('token-abc')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('caches the token and does not re-fetch before it expires', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ access_token: 'token-abc', expires_in: 3600 }), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await getTdmAccessToken()
    await getTdmAccessToken()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('re-fetches once the cached token is within the refresh skew of expiring', async () => {
    let call = 0
    const fetchMock = vi.fn(async () => {
      call += 1
      return new Response(
        JSON.stringify({ access_token: `token-${call}`, expires_in: 60 }),
        { status: 200 },
      )
    })
    vi.stubGlobal('fetch', fetchMock)

    const first = await getTdmAccessToken()
    expect(first).toBe('token-1')

    vi.advanceTimersByTime(61_000)

    const second = await getTdmAccessToken()
    expect(second).toBe('token-2')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('throws on a non-2xx response instead of returning an empty token', async () => {
    const fetchMock = vi.fn(async () => new Response('invalid_client', { status: 401 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(getTdmAccessToken()).rejects.toThrow(/TDM OAuth token request failed: 401/)
  })
})
