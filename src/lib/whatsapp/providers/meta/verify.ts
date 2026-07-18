import { createHmac, timingSafeEqual } from 'node:crypto'
import { env, isMetaWhatsAppConfigured } from '@/lib/env'

/** Meta webhook hub challenge (GET) — only needs WHATSAPP_VERIFY_TOKEN. */
export function verifyMetaHubChallenge(
  mode: string | null,
  token: string | null,
  challenge: string | null,
): string | null {
  if (!env.WHATSAPP_VERIFY_TOKEN) return null
  if (mode !== 'subscribe' || !token || !challenge) return null
  if (token !== env.WHATSAPP_VERIFY_TOKEN) return null
  return challenge
}

/**
 * Validate `X-Hub-Signature-256` over raw body bytes.
 * Header format: `sha256=<hex>`.
 */
export function verifyMetaSignature(
  signatureHeader: string | null,
  rawBody: string | Buffer,
): boolean {
  if (!isMetaWhatsAppConfigured() || !env.WHATSAPP_APP_SECRET) return false
  if (!signatureHeader?.startsWith('sha256=')) return false

  const expectedHex = createHmac('sha256', env.WHATSAPP_APP_SECRET)
    .update(rawBody)
    .digest('hex')
  const expected = Buffer.from(`sha256=${expectedHex}`, 'utf8')
  const actual = Buffer.from(signatureHeader, 'utf8')
  if (expected.length !== actual.length) return false
  return timingSafeEqual(expected, actual)
}
