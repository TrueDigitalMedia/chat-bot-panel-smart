import type { ChannelInbound } from '@/types/channel'

export type TwilioWhatsAppForm = Record<string, string>

/** Strip whatsapp: prefix → E.164 */
export function stripWhatsAppAddress(from: string): string {
  const raw = from.trim()
  if (raw.toLowerCase().startsWith('whatsapp:')) {
    return raw.slice('whatsapp:'.length).trim()
  }
  return raw
}

/**
 * Normalize Twilio WhatsApp form POST into ChannelInbound.
 * `pendingChoices` resolves numbered / label replies to callback_data.
 */
export function normalizeTwilioInbound(
  form: TwilioWhatsAppForm,
  pendingChoices?: Record<string, string> | null,
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
  } else if (pendingChoices && body) {
    const key = body.trim().toLowerCase()
    callbackData =
      pendingChoices[key] ||
      pendingChoices[body.trim()] ||
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
  }
}
