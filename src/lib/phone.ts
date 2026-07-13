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

/** Channels that cannot supply phone automatically — must ask the user. */
export function channelRequiresPhonePrompt(channel: string): boolean {
  return channel === 'telegram' || channel === 'web'
}
