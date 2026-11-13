import type { AdReferral, ChannelInbound } from '@/types/channel'
import { toE164 } from '@/lib/whatsapp/phone'
import { compactReferral } from '@/lib/whatsapp/providers/twilio/normalize-inbound'

export interface MetaWebhookPayload {
  object?: string
  entry?: Array<{
    changes?: Array<{
      value?: {
        /** Identifies which of the WABA's business numbers this change is about (spec 017). */
        metadata?: { phone_number_id?: string; display_phone_number?: string }
        messages?: Array<MetaInboundMessage>
        contacts?: Array<{ wa_id?: string; profile?: { name?: string } }>
      }
    }>
  }>
}

/** One inbound message plus the business number it was sent to (spec 017). */
export interface MetaInboundEnvelope {
  message: MetaInboundMessage
  phoneNumberId?: string
  displayPhoneNumber?: string
}

export interface MetaInboundMessage {
  from?: string
  id?: string
  timestamp?: string
  type?: string
  text?: { body?: string }
  interactive?: {
    type?: string
    button_reply?: { id?: string; title?: string }
    list_reply?: { id?: string; title?: string }
  }
  location?: { latitude?: number; longitude?: number }
  button?: { payload?: string; text?: string }
  /** Atribución del anuncio click-to-WhatsApp: Meta la adjunta solo al primer mensaje
   *  que el lead manda después de tocar el anuncio. */
  referral?: {
    source_id?: string
    source_type?: string
    source_url?: string
    ctwa_clid?: string
    headline?: string
    body?: string
    image_url?: string
    video_url?: string
  }
}

/**
 * Pasa `messages[].referral` de Meta Cloud API a `AdReferral`. El medio del anuncio llega
 * en `image_url` o en `video_url` según el creativo; los dos caen en el mismo `mediaUrl`.
 * Reusa compactReferral para que "no hay referral" signifique lo mismo que en Twilio.
 */
export function extractMetaReferral(message: MetaInboundMessage): AdReferral | undefined {
  const referral = message.referral
  if (!referral) return undefined

  const pick = (value?: string): string | undefined => {
    const trimmed = (value ?? '').trim()
    return trimmed || undefined
  }

  return compactReferral({
    sourceId: pick(referral.source_id),
    sourceType: pick(referral.source_type),
    sourceUrl: pick(referral.source_url),
    ctwaClid: pick(referral.ctwa_clid),
    headline: pick(referral.headline),
    body: pick(referral.body),
    mediaUrl: pick(referral.image_url) ?? pick(referral.video_url),
  })
}

export function extractMetaMessages(payload: MetaWebhookPayload): MetaInboundEnvelope[] {
  const out: MetaInboundEnvelope[] = []
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const phoneNumberId = change.value?.metadata?.phone_number_id
      const displayPhoneNumber = change.value?.metadata?.display_phone_number
      for (const msg of change.value?.messages ?? []) {
        out.push({ message: msg, phoneNumberId, displayPhoneNumber })
      }
    }
  }
  return out
}

/**
 * Normalize a Meta Cloud API inbound message into ChannelInbound.
 * `pendingChoices` resolves numbered / label text replies to callback_data.
 */
export function normalizeMetaInbound(
  message: MetaInboundMessage,
  pendingChoices?: Record<string, string> | null,
  phoneNumberId?: string,
): ChannelInbound | null {
  const from = message.from
  if (!from) return null

  const channelUserId = toE164(from)
  let callbackData: string | undefined
  let text = ''

  if (message.type === 'interactive') {
    callbackData =
      message.interactive?.button_reply?.id ||
      message.interactive?.list_reply?.id ||
      undefined
  } else if (message.type === 'button' && message.button?.payload) {
    callbackData = message.button.payload
  } else if (message.type === 'text') {
    text = (message.text?.body ?? '').trim()
  }

  if (!callbackData && pendingChoices && text) {
    const key = text.toLowerCase()
    callbackData =
      pendingChoices[key] ||
      pendingChoices[text] ||
      pendingChoices[text.trim().toLowerCase()]
  }

  const location =
    message.type === 'location' &&
    message.location &&
    typeof message.location.latitude === 'number' &&
    typeof message.location.longitude === 'number'
      ? {
          latitude: message.location.latitude,
          longitude: message.location.longitude,
        }
      : undefined

  return {
    channel: 'whatsapp',
    channelUserId,
    text: callbackData ? '' : text,
    callbackData,
    location,
    whatsappPhoneNumberId: phoneNumberId,
    adReferral: extractMetaReferral(message),
  }
}
