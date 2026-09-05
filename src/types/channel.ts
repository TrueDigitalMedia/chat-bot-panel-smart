/** Supported acquisition / messaging channels */
export type Channel = 'telegram' | 'whatsapp' | 'web'

/** Identity of a user on a specific channel (unique with channel) */
export interface ChannelRecipient {
  channel: Channel
  channelUserId: string
  /** WhatsApp only (spec 017): the Meta phone_number_id the bot must reply from. When the
   *  recipient is a Lead this is `lead.whatsappPhoneNumberId`; absent ⇒ outbound falls back
   *  to the shared default number. */
  whatsappPhoneNumberId?: string | null
}

/** Normalized inbound event after channel adapter parsing */
export interface ChannelInbound {
  channel: Channel
  channelUserId: string
  channelUsername?: string
  text: string
  callbackData?: string
  /** Shared contact phone (Telegram request_contact), E.164-ish raw */
  contactPhone?: string
  /** Ephemeral GPS from Telegram location share — do not persist */
  location?: { latitude: number; longitude: number }
  /** WhatsApp/Meta only (spec 017): the business number this message was sent to,
   *  from `value.metadata.phone_number_id`. Undefined for Twilio and legacy payloads. */
  whatsappPhoneNumberId?: string
}

export function isChannel(value: string): value is Channel {
  return value === 'telegram' || value === 'whatsapp' || value === 'web'
}
