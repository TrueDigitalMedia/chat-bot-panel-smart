/**
 * Normalize phone to digits with leading + when country code present.
 * Accepts shared Telegram contacts and typed numbers.
 */
export function normalizePhone(input: string): string | null {
  const raw = input.trim()
  if (!raw) return null

  const hasPlus = raw.startsWith('+')
  const digits = raw.replace(/\D/g, '')
  // E.164 caps at 15 digits, but a real consumer mobile in our markets (DR, Guatemala,
  // Ecuador, Mexico, CAM) is 10-13 with the country code. Cap at 14 so a 15-19 digit
  // BSUID digit-string that slipped past the isBsuidChannelUserId guard can't be
  // mistaken for a phone here either (the pre-fix bug baked exactly-15-digit fakes into
  // some rows — see project_bsuid_fake_phone_bug).
  if (digits.length < 8 || digits.length > 14) return null

  return hasPlus || digits.length >= 10 ? `+${digits}` : digits
}

/**
 * A phone number safe to address the Authentication OTP template to (Meta requires a
 * real phone, not a BSUID, for copy-code auth templates). Guards the OTP send in
 * deliver-registration-code.ts against a malformed/BSUID-derived value that is
 * non-null but not a real number — those fail delivery (Twilio 63005 / WhatsApp
 * 131026) and drag the template's delivery-rate KPI.
 */
export function isValidRegistrationPhone(phone: string | null | undefined): phone is string {
  return typeof phone === 'string' && /^\+\d{8,14}$/.test(phone.trim())
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

/**
 * True when a WhatsApp `channelUserId` is a Business-Scoped User ID (BSUID) rather than a
 * real phone number. Meta issues these — format "CC.alphanumeric", e.g.
 * "DO.929750206851603" — for users on WhatsApp's newer username/privacy feature, and they
 * arrive in every webhook field where a phone would normally be. A genuine WhatsApp id is
 * E.164 digits with an optional leading "+"; anything containing a "." or letters is a
 * BSUID. resolveWhatsAppPhone must NOT try to coerce one into a phone — normalizePhone
 * would happily strip the "DO." and yield a bogus "+929750206851603".
 */
export function isBsuidChannelUserId(channelUserId: string): boolean {
  return !/^\+?\d+$/.test(channelUserId.trim())
}
