/** Normalize WA id to E.164 with leading +. Meta often omits `+`. */
export function toE164(phone: string): string {
  const raw = phone.trim()
  if (!raw) return raw
  if (raw.startsWith('+')) return raw
  if (/^\d+$/.test(raw)) return `+${raw}`
  return raw
}

/** Strip `whatsapp:` prefix then normalize to E.164. */
export function stripWhatsAppAddress(from: string): string {
  const raw = from.trim()
  const withoutPrefix = raw.toLowerCase().startsWith('whatsapp:')
    ? raw.slice('whatsapp:'.length).trim()
    : raw
  return toE164(withoutPrefix)
}

/** Digits only for Meta Graph `to` field (no +). */
export function toMetaRecipient(channelUserId: string): string {
  return toE164(channelUserId).replace(/^\+/, '')
}

/**
 * True for a WhatsApp Business-Scoped User ID ("CC.digits", e.g. "DO.1393047009463368") —
 * what Twilio sends instead of a phone number in `From`/`channel_user_id` once a user has
 * adopted WhatsApp's newer username/privacy feature (BSUIDs appearing in webhooks since
 * ~April 2026). Regular text/utility-template sends route to a BSUID fine (confirmed via
 * Twilio's own delivery logs), but Meta rejects an Authentication-category template (used
 * for OTP/verification codes) addressed to one — error 63005 "Channel rejected content",
 * status "failed", with every other message in the same conversation delivering
 * successfully. See deliver-registration-code.ts's useSplitTemplates for where this
 * matters.
 */
export function isBsuidChannelUserId(channelUserId: string): boolean {
  return /^[A-Z]{2}\.\d+$/.test(channelUserId)
}
