/**
 * WhatsApp per-country number registry — spec 017.
 *
 * Constitution v1.2.0 Principle V: this is the ONLY place a Meta `phone_number_id` is
 * switched on a recruitment country. Everything else calls `countryForPhoneNumberId`.
 *
 * Backed by the `WHATSAPP_NUMBER_MAP` env var (JSON: `{ "<phone_number_id>": "Ecuador", … }`).
 * All numbers live under one shared WABA — one access token, one app secret, one template
 * inventory — so nothing here touches credentials or templates.
 *
 * A bad env value degrades gracefully (empty registry ⇒ every number generic, i.e. the
 * exact pre-017 behavior) and never throws: this module is imported at boot.
 */
import { env } from '@/lib/env'
import { isSupportedCountry } from '@/lib/countries/registry'

export interface WhatsAppNumberInfo {
  phoneNumberId: string
  /** null ⇒ generic number that still asks the country question. */
  country: string | null
  /** true for `env.WHATSAPP_PHONE_NUMBER_ID` (the shared default / CAM number). */
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
 * shared number (unknown id, absent id, the default CAM id, `null`/`undefined`/`''`).
 * Pure, synchronous, never throws.
 */
export function countryForPhoneNumberId(id: string | null | undefined): string | null {
  if (!id) return null
  return NUMBER_MAP.get(id) ?? null
}

/** The shared default / CAM number id — outbound fallback when a lead has no bound number. */
export function defaultPhoneNumberId(): string | undefined {
  return env.WHATSAPP_PHONE_NUMBER_ID
}

/**
 * Every configured WhatsApp number: the mapped ones plus the default CAM id (deduped).
 * Default first, then map insertion order. Powers the admin numbers page.
 */
export function listWhatsAppNumbers(): WhatsAppNumberInfo[] {
  const out: WhatsAppNumberInfo[] = []
  const defaultId = env.WHATSAPP_PHONE_NUMBER_ID
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
export function inboundNumberOutcome(id: string | null | undefined): 'scoped' | 'generic' | 'unknown_number' {
  if (!id) return 'generic'
  if (NUMBER_MAP.has(id)) return 'scoped'
  if (id === env.WHATSAPP_PHONE_NUMBER_ID) return 'generic'
  return 'unknown_number'
}
