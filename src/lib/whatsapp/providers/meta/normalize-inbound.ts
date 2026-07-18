import type { ChannelInbound } from '@/types/channel'
import { toE164 } from '@/lib/whatsapp/phone'

export interface MetaWebhookPayload {
  object?: string
  entry?: Array<{
    changes?: Array<{
      value?: {
        messages?: Array<MetaInboundMessage>
        contacts?: Array<{ wa_id?: string; profile?: { name?: string } }>
      }
    }>
  }>
}

interface MetaInboundMessage {
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
}

export function extractMetaMessages(payload: MetaWebhookPayload): MetaInboundMessage[] {
  const out: MetaInboundMessage[] = []
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      for (const msg of change.value?.messages ?? []) {
        out.push(msg)
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
  }
}
