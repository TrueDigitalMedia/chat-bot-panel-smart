import { describe, it, expect, vi, beforeEach } from 'vitest'

interface FakeCookieStore {
  get(name: string): { value: string } | undefined
  set(name: string, value: string, options?: Record<string, unknown>): void
}

let store: Map<string, string>
let lastSetOptions: Record<string, unknown> | null

function fakeCookieStore(): FakeCookieStore {
  return {
    get: (name: string) => (store.has(name) ? { value: store.get(name)! } : undefined),
    set: (name: string, value: string, options?: Record<string, unknown>) => {
      store.set(name, value)
      lastSetOptions = options ?? null
    },
  }
}

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => fakeCookieStore()),
}))

import {
  getOrCreateWebSessionId,
  WEB_SESSION_COOKIE_NAME,
  WEB_SESSION_MAX_AGE_SECONDS,
} from '@/lib/web/session'

describe('getOrCreateWebSessionId', () => {
  beforeEach(() => {
    store = new Map()
    lastSetOptions = null
  })

  it('generates a new UUID and sets the cookie when none exists', async () => {
    const result = await getOrCreateWebSessionId()
    expect(result.isNew).toBe(true)
    expect(result.sessionId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
    expect(store.get(WEB_SESSION_COOKIE_NAME)).toBe(result.sessionId)
  })

  it('reuses the existing cookie value without generating a new one', async () => {
    store.set(WEB_SESSION_COOKIE_NAME, 'existing-session-id')
    const result = await getOrCreateWebSessionId()
    expect(result.isNew).toBe(false)
    expect(result.sessionId).toBe('existing-session-id')
  })

  it('sets the cookie with the exact attributes required by research.md R1', async () => {
    await getOrCreateWebSessionId()
    expect(lastSetOptions).toMatchObject({
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: WEB_SESSION_MAX_AGE_SECONDS,
    })
  })

  it('generates a different id per call when no cookie is ever persisted (no accidental caching)', async () => {
    const first = await getOrCreateWebSessionId()
    store.clear()
    const second = await getOrCreateWebSessionId()
    expect(first.sessionId).not.toBe(second.sessionId)
  })
})
