import { describe, it, expect, beforeEach, vi } from 'vitest'
import twilio from 'twilio'

vi.mock('@/lib/env', () => ({
  env: {
    TWILIO_ACCOUNT_SID: 'AC_test',
    TWILIO_AUTH_TOKEN: 'test_token',
    TWILIO_WEBHOOK_URL: 'https://app.example.com/api/webhooks/whatsapp/twilio',
    APP_BASE_URL: 'https://app.example.com',
    TWILIO_SIGNATURE_DEBUG: undefined,
  },
  isTwilioConfigured: () => true,
}))

import { verifyTwilioSignature, twilioWebhookUrlCandidates } from './verify'

const TOKEN = 'test_token'
const PARAMS = { From: 'whatsapp:+50255551234', To: 'whatsapp:+17869337825', Body: 'hola' }

function sign(url: string): string {
  return twilio.getExpectedTwilioSignature(TOKEN, url, PARAMS)
}

function req(url: string, headers: Record<string, string> = {}): { url: string; headers: Headers } {
  return { url, headers: new Headers(headers) }
}

describe('twilioWebhookUrlCandidates', () => {
  it('includes the actual request path on the forwarded host (the real prod case)', () => {
    const c = twilioWebhookUrlCandidates(
      req('https://internal.vercel.app/api/webhooks/whatsapp', {
        'x-forwarded-host': 'chat-bot-panel-smart.vercel.app',
        'x-forwarded-proto': 'https',
      }),
    )
    expect(c).toContain('https://chat-bot-panel-smart.vercel.app/api/webhooks/whatsapp')
  })

  it('includes the configured TWILIO_WEBHOOK_URL verbatim', () => {
    const c = twilioWebhookUrlCandidates(req('https://app.example.com/api/webhooks/whatsapp/twilio'))
    expect(c).toContain('https://app.example.com/api/webhooks/whatsapp/twilio')
  })
})

describe('verifyTwilioSignature', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('accepts a signature computed for the primary path when configured for the /twilio path', () => {
    // Twilio number posts to /api/webhooks/whatsapp; env names the /twilio alternative.
    const signedUrl = 'https://chat-bot-panel-smart.vercel.app/api/webhooks/whatsapp'
    const signature = sign(signedUrl)
    const request = req('https://internal.vercel.app/api/webhooks/whatsapp', {
      'x-forwarded-host': 'chat-bot-panel-smart.vercel.app',
      'x-forwarded-proto': 'https',
    })
    expect(
      verifyTwilioSignature(signature, twilioWebhookUrlCandidates(request), PARAMS),
    ).toBe(true)
  })

  it('accepts a signature computed with a trailing slash', () => {
    const signature = sign('https://app.example.com/api/webhooks/whatsapp/twilio/')
    const request = req('https://app.example.com/api/webhooks/whatsapp/twilio')
    expect(
      verifyTwilioSignature(signature, twilioWebhookUrlCandidates(request), PARAMS),
    ).toBe(true)
  })

  it('rejects a signature that does not match any candidate', () => {
    expect(
      verifyTwilioSignature('bogus', twilioWebhookUrlCandidates(req('https://app.example.com/x')), PARAMS),
    ).toBe(false)
  })

  it('rejects a missing signature', () => {
    expect(verifyTwilioSignature(null, ['https://app.example.com/x'], PARAMS)).toBe(false)
  })
})
