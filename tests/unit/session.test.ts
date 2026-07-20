import { describe, it, expect } from 'vitest'
import { createSessionCookie, verifySessionCookie } from '@/lib/auth/session'

const SECRET = 'test-session-secret'

describe('session cookie sign/verify (FR-005)', () => {
  it('a freshly created cookie verifies successfully', async () => {
    const cookie = await createSessionCookie(SECRET)
    await expect(verifySessionCookie(SECRET, cookie)).resolves.toBe(true)
  })

  it('rejects a missing cookie', async () => {
    await expect(verifySessionCookie(SECRET, undefined)).resolves.toBe(false)
    await expect(verifySessionCookie(SECRET, null)).resolves.toBe(false)
    await expect(verifySessionCookie(SECRET, '')).resolves.toBe(false)
  })

  it('rejects a malformed cookie', async () => {
    await expect(verifySessionCookie(SECRET, 'not-a-valid-cookie')).resolves.toBe(false)
    await expect(verifySessionCookie(SECRET, '12345')).resolves.toBe(false)
  })

  it('rejects an expired cookie', async () => {
    const expiredExpiry = Date.now() - 1000
    const fakeCookie = `${expiredExpiry}.deadbeef`
    await expect(verifySessionCookie(SECRET, fakeCookie)).resolves.toBe(false)
  })

  it('rejects a tampered signature', async () => {
    const cookie = await createSessionCookie(SECRET)
    const [expiresAt] = cookie.split('.')
    const tampered = `${expiresAt}.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA`
    await expect(verifySessionCookie(SECRET, tampered)).resolves.toBe(false)
  })

  it('rejects a cookie signed with a different secret', async () => {
    const cookie = await createSessionCookie('a-different-secret')
    await expect(verifySessionCookie(SECRET, cookie)).resolves.toBe(false)
  })

  it('rejects a cookie whose expiry was tampered to extend it', async () => {
    const cookie = await createSessionCookie(SECRET)
    const [, signature] = cookie.split('.')
    const extended = `${Date.now() + 1000 * 60 * 60 * 24 * 365}.${signature}`
    await expect(verifySessionCookie(SECRET, extended)).resolves.toBe(false)
  })
})
