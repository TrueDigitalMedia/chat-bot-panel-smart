import { describe, it, expect, vi, beforeEach } from 'vitest'

// env.ts validates eagerly at import — stub it so this pure test doesn't need real vars.
const { envMock } = vi.hoisted(() => ({ envMock: {} as { APP_BASE_URL?: string } }))
vi.mock('@/lib/env', () => ({ env: envMock }))

import { CHAT_ROOMS, resolveRoom, roomUrl, listRooms } from '@/lib/web/chat-rooms'

describe('resolveRoom — mapping table (spec 016 contract)', () => {
  it.each([
    ['ecuador', 'Ecuador'],
    ['Ecuador', 'Ecuador'],
    ['ECUADOR', 'Ecuador'],
    ['mexico', 'México'],
    ['méxico', 'México'],
    ['Mexico', 'México'],
    ['MÉXICO', 'México'],
  ])('resolveRoom(%o) -> %o', (slug, country) => {
    expect(resolveRoom(slug)).toBe(country)
  })

  it.each([['guatemala'], ['ecuadorr'], [''], ['../x'], ['../../etc/passwd'], ['ecuador/..'], ['%2e%2e']])(
    'resolveRoom(%o) -> null (miss / path traversal)',
    (slug) => {
      expect(resolveRoom(slug)).toBeNull()
    },
  )

  it('never throws on a non-string input', () => {
    // @ts-expect-error — deliberately wrong type
    expect(resolveRoom(undefined)).toBeNull()
    // @ts-expect-error
    expect(resolveRoom(null)).toBeNull()
  })
})

describe('roomUrl', () => {
  beforeEach(() => {
    delete envMock.APP_BASE_URL
  })

  it('returns a relative path when APP_BASE_URL is unset', () => {
    expect(roomUrl('Ecuador')).toBe('/chat/ecuador')
    expect(roomUrl('México')).toBe('/chat/mexico')
  })

  it('returns an absolute URL when APP_BASE_URL is set (trailing slash trimmed)', () => {
    envMock.APP_BASE_URL = 'https://panel.example.com/'
    expect(roomUrl('Ecuador')).toBe('https://panel.example.com/chat/ecuador')
    expect(roomUrl('México')).toBe('https://panel.example.com/chat/mexico')
  })

  it('returns "" for a non-room country (callers never pass one)', () => {
    expect(roomUrl('Guatemala')).toBe('')
  })
})

describe('listRooms', () => {
  it('returns exactly the 2 rooms, URLs consistent with roomUrl', () => {
    delete envMock.APP_BASE_URL
    const rooms = listRooms()
    expect(rooms).toEqual([
      { country: 'Ecuador', slug: 'ecuador', url: '/chat/ecuador' },
      { country: 'México', slug: 'mexico', url: '/chat/mexico' },
    ])
  })

  it('CHAT_ROOMS is the fixed Ecuador + México set', () => {
    expect(CHAT_ROOMS).toEqual({ ecuador: 'Ecuador', mexico: 'México' })
  })
})
