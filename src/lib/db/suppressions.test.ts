import { describe, it, expect, vi } from 'vitest'

vi.mock('./client', () => ({ db: {}, sql: {} }))

import { suppressionIdentifiers, isOptOutReason } from './suppressions'

describe('suppressionIdentifiers', () => {
  it('normalizes a WhatsApp phone channelUserId to E.164', () => {
    expect(suppressionIdentifiers({ channel: 'whatsapp', channelUserId: '50255551234' })).toEqual([
      '+50255551234',
    ])
  })

  it('keeps a WhatsApp BSUID as-is (never coerced to a fake phone)', () => {
    expect(
      suppressionIdentifiers({ channel: 'whatsapp', channelUserId: 'DO.929750206851603' }),
    ).toEqual(['DO.929750206851603'])
  })

  it('includes both the channelUserId and a distinct stored phoneNumber', () => {
    const ids = suppressionIdentifiers({
      channel: 'whatsapp',
      channelUserId: 'DO.123456',
      phoneNumber: '+50255559999',
    })
    expect(ids).toEqual(expect.arrayContaining(['DO.123456', '+50255559999']))
    expect(ids).toHaveLength(2)
  })

  it('dedupes when channelUserId and phoneNumber normalize to the same value', () => {
    expect(
      suppressionIdentifiers({
        channel: 'whatsapp',
        channelUserId: '+50255551234',
        phoneNumber: '50255551234',
      }),
    ).toEqual(['+50255551234'])
  })

  it('passes a telegram numeric id through unchanged', () => {
    expect(suppressionIdentifiers({ channel: 'telegram', channelUserId: '987654321' })).toEqual([
      '987654321',
    ])
  })
})

describe('isOptOutReason', () => {
  it('is true for an express stop signal', () => {
    expect(isOptOutReason('user_freetext_opt_out')).toBe(true)
    expect(isOptOutReason('re_engagement_declined_1st_attempt')).toBe(true)
    expect(isOptOutReason('twilio_stop')).toBe(true)
  })

  it('is false for a silent drop-off or an unrelated reason', () => {
    expect(isOptOutReason('re_engagement_exhausted')).toBe(false)
    expect(isOptOutReason('survey_complete_no_quota')).toBe(false)
    expect(isOptOutReason(null)).toBe(false)
  })
})
