import type { AdReferral, ChannelInbound } from '@/types/channel'
import { stripWhatsAppAddress } from '@/lib/whatsapp/phone'

export type TwilioWhatsAppForm = Record<string, string>

/**
 * Quita las keys cuyo valor quedó en undefined y devuelve undefined si no sobrevivió
 * ninguna, para que un webhook sin atribución no deje un objeto vacío colgando en
 * `adReferral` (que haría que todo el pipeline crea que hubo anuncio). Compartida con el
 * normalizador de Meta: las dos fuentes tienen que decidir "no hay referral" igual.
 */
export function compactReferral(referral: AdReferral): AdReferral | undefined {
  const entries = Object.entries(referral).filter(([, value]) => value !== undefined)
  return entries.length > 0 ? (Object.fromEntries(entries) as AdReferral) : undefined
}

/**
 * Lee la atribución de anuncio click-to-WhatsApp del form de Twilio (campos `Referral*`).
 * Los campos vacíos o en blanco se descartan: Twilio manda la key igual aunque Meta no
 * haya puesto valor.
 */
export function extractTwilioReferral(form: TwilioWhatsAppForm): AdReferral | undefined {
  const pick = (key: string): string | undefined => {
    const value = (form[key] ?? '').trim()
    return value || undefined
  }

  return compactReferral({
    sourceId: pick('ReferralSourceId'),
    sourceType: pick('ReferralSourceType'),
    sourceUrl: pick('ReferralSourceUrl'),
    ctwaClid: pick('ReferralCtwaClid'),
    headline: pick('ReferralHeadline'),
    body: pick('ReferralBody'),
    mediaUrl: pick('ReferralMediaUrl'),
  })
}

/**
 * Normalize Twilio WhatsApp form POST into ChannelInbound.
 * `pendingChoices` resolves numbered / label replies to callback_data.
 */
export function normalizeTwilioInbound(
  form: TwilioWhatsAppForm,
  pendingChoices?: Record<string, string> | null,
  /** spec 017 — E.164 of our business number the user messaged (Twilio `To`, stripped). */
  toNumberId?: string,
): ChannelInbound {
  const from = form.From || form.from || ''
  const channelUserId = stripWhatsAppAddress(from)
  const body = (form.Body || form.body || '').trim()
  const buttonPayload =
    form.ButtonPayload ||
    form.buttonPayload ||
    form.ListId ||
    form.listId ||
    ''
  const buttonText = (form.ButtonText || form.buttonText || '').trim()

  let callbackData: string | undefined
  if (buttonPayload) {
    callbackData = buttonPayload
  } else if (pendingChoices && (body || buttonText)) {
    const key = (buttonText || body).trim().toLowerCase()
    callbackData =
      pendingChoices[key] ||
      pendingChoices[body.trim()] ||
      pendingChoices[body.trim().toLowerCase()] ||
      pendingChoices[buttonText.toLowerCase()]
  }

  const lat = form.Latitude || form.latitude
  const lon = form.Longitude || form.longitude
  const location =
    lat && lon && !Number.isNaN(Number(lat)) && !Number.isNaN(Number(lon))
      ? { latitude: Number(lat), longitude: Number(lon) }
      : undefined

  return {
    channel: 'whatsapp',
    channelUserId,
    text: callbackData ? '' : body,
    callbackData,
    location,
    whatsappPhoneNumberId: toNumberId,
    adReferral: extractTwilioReferral(form),
  }
}
