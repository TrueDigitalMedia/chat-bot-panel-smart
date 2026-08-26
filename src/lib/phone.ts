/**
 * Normalize phone to digits with leading + when country code present.
 * Accepts shared Telegram contacts and typed numbers.
 */
export function normalizePhone(input: string): string | null {
  const raw = input.trim()
  if (!raw) return null

  const hasPlus = raw.startsWith('+')
  const digits = raw.replace(/\D/g, '')
  if (digits.length < 8 || digits.length > 15) return null

  return hasPlus || digits.length >= 10 ? `+${digits}` : digits
}

/**
 * Channels that cannot supply phone automatically — must ask the user. WhatsApp is
 * included even though phone-capture.ts's resolveWhatsAppPhone auto-derives the phone
 * from channelUserId for the common case: since ~April 2026, a WhatsApp user on Meta's
 * newer username/privacy feature has their real phone replaced with a Business-Scoped
 * User ID (BSUID, format "CC.alphanumeric", e.g. "DO.1393047009463368") in every webhook
 * field — resolveWhatsAppPhone correctly fails to derive a phone from that, and without
 * this the lead would sail through the rest of the survey with phoneNumber stuck null,
 * only to have the registration code request reject with "Campos requeridos faltantes:
 * telefono" at the very end.
 */
export function channelRequiresPhonePrompt(channel: string): boolean {
  return channel === 'telegram' || channel === 'web' || channel === 'whatsapp'
}
