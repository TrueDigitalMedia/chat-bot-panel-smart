import { describe, it, expect, vi } from 'vitest'
import { createHmac } from 'node:crypto'

// spec 017 US3 — a single shared WHATSAPP_APP_SECRET verifies inbound payloads for every
// business number under the shared WABA (FR-009); no per-number secret exists.

const { envMock } = vi.hoisted(() => ({
  envMock: {
    WHATSAPP_ACCESS_TOKEN: 'tok',
    WHATSAPP_PHONE_NUMBER_ID: 'CAM_ID',
    WHATSAPP_VERIFY_TOKEN: 'vt',
    WHATSAPP_APP_SECRET: 'shared-secret',
  } as Record<string, string | undefined>,
}))
vi.mock('@/lib/env', () => ({
  env: envMock,
  isMetaWhatsAppConfigured: () => true,
}))

import { verifyMetaSignature } from '@/lib/whatsapp/providers/meta/verify'
import { extractMetaMessages } from '@/lib/whatsapp/providers/meta/normalize-inbound'

function sign(body: string): string {
  return `sha256=${createHmac('sha256', 'shared-secret').update(body).digest('hex')}`
}

describe('FR-009 — one shared secret verifies every number', () => {
  it.each([['EC_ID'], ['MX_ID'], ['CAM_ID'], ['UNKNOWN_ID']])(
    'a payload for phone_number_id %s signed with the shared secret verifies',
    (phoneNumberId) => {
      const body = JSON.stringify({
        entry: [
          {
            changes: [
              {
                value: {
                  metadata: { phone_number_id: phoneNumberId },
                  messages: [{ from: '5939', type: 'text', text: { body: 'hola' } }],
                },
              },
            ],
          },
        ],
      })
      expect(verifyMetaSignature(sign(body), body)).toBe(true)
      const envelopes = extractMetaMessages(JSON.parse(body))
      expect(envelopes[0].phoneNumberId).toBe(phoneNumberId)
    },
  )

  it('rejects a payload signed with a different secret (no per-number secret fallback)', () => {
    const body = '{"entry":[]}'
    const wrong = `sha256=${createHmac('sha256', 'other').update(body).digest('hex')}`
    expect(verifyMetaSignature(wrong, body)).toBe(false)
  })
})

describe('extractMetaMessages — multiple changes / numbers in one payload', () => {
  it('attributes each message to its own change.value.metadata', () => {
    const envelopes = extractMetaMessages({
      entry: [
        {
          changes: [
            {
              value: {
                metadata: { phone_number_id: 'EC_ID' },
                messages: [{ from: '111', type: 'text', text: { body: 'a' } }],
              },
            },
            {
              value: {
                metadata: { phone_number_id: 'MX_ID' },
                messages: [{ from: '222', type: 'text', text: { body: 'b' } }],
              },
            },
          ],
        },
      ],
    })
    expect(envelopes.map((e) => e.phoneNumberId)).toEqual(['EC_ID', 'MX_ID'])
  })
})
