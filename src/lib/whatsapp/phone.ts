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
