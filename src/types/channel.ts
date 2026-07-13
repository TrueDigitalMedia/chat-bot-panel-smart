/** Supported acquisition / messaging channels */
export type Channel = 'telegram' | 'whatsapp' | 'web'

/** Identity of a user on a specific channel (unique with channel) */
export interface ChannelRecipient {
  channel: Channel
  channelUserId: string
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
}

export function isChannel(value: string): value is Channel {
  return value === 'telegram' || value === 'whatsapp' || value === 'web'
}
