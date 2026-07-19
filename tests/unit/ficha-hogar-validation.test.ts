import { describe, it, expect, vi } from 'vitest'

// `db/client.ts` calls `neon(process.env.POSTGRES_URL!)` at module load, and `env.ts`
// (pulled in transitively via telegram/send.ts) validates required env vars eagerly too
// — mock both so this unit test doesn't need real credentials (same pattern as spec
// 005/006/007's db/client mock, extended here for the second eager-init module found).
vi.mock('@/lib/db/client', () => ({ db: {} }))
vi.mock('@/lib/env', () => ({
  env: { TELEGRAM_BOT_TOKEN: 'test', SUPPORT_CONTACT: '555555555' },
  isMetaWhatsAppConfigured: () => false,
  isTwilioConfigured: () => false,
}))

import { isPlausibleBirthDate } from '@/lib/conversation/phases/phase-4'

describe('isPlausibleBirthDate (FR-004)', () => {
  it('accepts a valid past date in a reasonable range', () => {
    expect(isPlausibleBirthDate('15/06/1990')).toBe(true)
  })

  it('rejects a future date', () => {
    const future = new Date()
    future.setFullYear(future.getFullYear() + 1)
    const dd = String(future.getDate()).padStart(2, '0')
    const mm = String(future.getMonth() + 1).padStart(2, '0')
    const yyyy = future.getFullYear()
    expect(isPlausibleBirthDate(`${dd}/${mm}/${yyyy}`)).toBe(false)
  })

  it('rejects an implausibly old date (> 120 years)', () => {
    expect(isPlausibleBirthDate('01/01/1850')).toBe(false)
  })

  it('rejects a malformed string', () => {
    expect(isPlausibleBirthDate('not-a-date')).toBe(false)
    expect(isPlausibleBirthDate('1990-06-15')).toBe(false)
  })

  it('rejects an out-of-range month/day that JS Date would otherwise silently roll over', () => {
    // new Date(1990, 12, 15) silently becomes Jan 15 1991 — caught by the roundtrip check.
    expect(isPlausibleBirthDate('15/13/1990')).toBe(false)
    expect(isPlausibleBirthDate('32/01/1990')).toBe(false)
  })

  it('accepts today as a boundary (age 0)', () => {
    const today = new Date()
    const dd = String(today.getDate()).padStart(2, '0')
    const mm = String(today.getMonth() + 1).padStart(2, '0')
    const yyyy = today.getFullYear()
    expect(isPlausibleBirthDate(`${dd}/${mm}/${yyyy}`)).toBe(true)
  })
})
