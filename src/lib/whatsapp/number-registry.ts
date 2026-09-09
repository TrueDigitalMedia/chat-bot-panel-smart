/**
 * WhatsApp per-country number registry — spec 017.
 *
 * Constitution v1.2.0 Principle V: this is the ONLY place a WhatsApp business number is
 * switched on a recruitment country. Everything else calls `countryForSenderId`.
 *
 * Backed by the `WHATSAPP_NUMBER_MAP` env var (JSON: `{ "<sender id>": "Ecuador", … }`).
 * The "sender id" is provider-specific:
 *   - Meta   → the number's `phone_number_id` (from webhook `value.metadata.phone_number_id`)
 *   - Twilio → the business number in E.164 (from the inbound webhook's `To`, `whatsapp:` stripped)
 * A deployment uses one provider, so the map only ever holds one kind of key.
 *
 * All numbers live under one shared account (Meta WABA / Twilio project) — one token, one
 * signing secret, one template inventory — so nothing here touches credentials or templates.
 *
 * A bad env value degrades gracefully (empty registry ⇒ every number generic, i.e. the
 * exact pre-017 behavior) and never throws: this module is imported at boot.
 */
import { env } from '@/lib/env'
import { isSupportedCountry } from '@/lib/countries/registry'
import { getWhatsAppProvider } from '@/lib/whatsapp/provider'
import { stripWhatsAppAddress } from '@/lib/whatsapp/phone'

export interface WhatsAppNumberInfo {
  /** Provider sender id — Meta phone_number_id or Twilio E.164 business number. */
  phoneNumberId: string
  /** null ⇒ generic number that still asks the country question. */
  country: string | null
  /** true for the provider's shared default sender (WHATSAPP_PHONE_NUMBER_ID / TWILIO_WHATSAPP_FROM). */
  isDefault: boolean
}

function parseNumberMap(raw: string | undefined): Map<string, string> {
  const map = new Map<string, string>()
  if (!raw || raw.trim() === '') {
    console.info(JSON.stringify({ event: 'whatsapp_number_map_empty' }))
    return map
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    console.error(JSON.stringify({ event: 'whatsapp_number_map_invalid_json' }))
    return map
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    console.error(JSON.stringify({ event: 'whatsapp_number_map_invalid_json', reason: 'not_an_object' }))
    return map
  }

  for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof value !== 'string' || !isSupportedCountry(value)) {
      console.warn(
        JSON.stringify({ event: 'whatsapp_number_map_bad_country', id, value: String(value) }),
      )
      continue
    }
    map.set(id, value)
  }
  return map
}

/** Parsed once at module load — a redeploy picks up a changed env value. */
const NUMBER_MAP: Map<string, string> = parseNumberMap(env.WHATSAPP_NUMBER_MAP)

/**
 * The recruitment country a business number is scoped to, or `null` for the generic /
 * shared number (unknown id, absent id, the default id, `null`/`undefined`/`''`).
 * Pure, synchronous, never throws.
 */
export function countryForSenderId(id: string | null | undefined): string | null {
  if (!id) return null
  return NUMBER_MAP.get(id) ?? null
}

/** @deprecated Meta-era name — kept as an alias. Use `countryForSenderId`. */
export const countryForPhoneNumberId = countryForSenderId

/**
 * The provider's shared default sender id — the outbound fallback when a lead has no bound
 * number, and the "this is the generic number" reference for `inboundNumberOutcome`.
 * Meta → `WHATSAPP_PHONE_NUMBER_ID`; Twilio → E.164 of `TWILIO_WHATSAPP_FROM`.
 */
export function defaultSenderId(): string | undefined {
  if (getWhatsAppProvider() === 'twilio') {
    return env.TWILIO_WHATSAPP_FROM ? stripWhatsAppAddress(env.TWILIO_WHATSAPP_FROM) : undefined
  }
  return env.WHATSAPP_PHONE_NUMBER_ID
}

/** @deprecated Meta-era name — kept as an alias. Use `defaultSenderId`. */
export const defaultPhoneNumberId = defaultSenderId

/**
 * Every configured WhatsApp number: the mapped ones plus the provider default (deduped).
 * Default first, then map insertion order. Powers the admin numbers page.
 */
export function listWhatsAppNumbers(): WhatsAppNumberInfo[] {
  const out: WhatsAppNumberInfo[] = []
  const defaultId = defaultSenderId()
  const seen = new Set<string>()

  if (defaultId) {
    out.push({ phoneNumberId: defaultId, country: NUMBER_MAP.get(defaultId) ?? null, isDefault: true })
    seen.add(defaultId)
  }
  for (const [id, country] of NUMBER_MAP) {
    if (seen.has(id)) continue
    out.push({ phoneNumberId: id, country, isDefault: false })
    seen.add(id)
  }
  return out
}

/** For the webhook's `whatsapp_inbound_number` log — see contracts/inbound-number-attribution.md. */
export function inboundNumberOutcome(
  id: string | null | undefined,
): 'scoped' | 'generic' | 'unknown_number' {
  if (!id) return 'generic'
  if (NUMBER_MAP.has(id)) return 'scoped'
  if (id === defaultSenderId()) return 'generic'
  return 'unknown_number'
}
