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

/**
 * Atribución de un anuncio click-to-WhatsApp (Meta). Llega en el primer mensaje que el
 * lead manda después de tocar el anuncio: Twilio lo expone como campos `Referral*` del
 * form y Meta Cloud API como `messages[].referral`. Todos los campos son opcionales
 * porque Meta no garantiza ninguno en particular; lo único que realmente permite unir el
 * lead con su anuncio / ad set / campaña es `sourceId` (y `ctwaClid` para el join con
 * los reportes de Ads).
 */
export interface AdReferral {
  /** ID del anuncio en Meta (`source_id` / `ReferralSourceId`) — la clave del join. */
  sourceId?: string
  /** De dónde vino el toque: 'ad' | 'post' (`source_type` / `ReferralSourceType`). */
  sourceType?: string
  /** URL del anuncio o del post (`source_url` / `ReferralSourceUrl`). */
  sourceUrl?: string
  /** Click ID de click-to-WhatsApp (`ctwa_clid`) — lo que cruza con los reportes de Ads. */
  ctwaClid?: string
  /** Titular del anuncio tal como lo vio el lead (`headline`). */
  headline?: string
  /** Cuerpo del anuncio tal como lo vio el lead (`body`). */
  body?: string
  /** Imagen o video del anuncio (`image_url` ?? `video_url` / `ReferralMediaUrl`). */
  mediaUrl?: string
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
  /** Atribución del anuncio click-to-WhatsApp que originó la conversación, cuando el
   *  webhook la trae. Solo viene en el primer mensaje tras tocar el anuncio. */
  adReferral?: AdReferral
}

export function isChannel(value: string): value is Channel {
  return value === 'telegram' || value === 'whatsapp' || value === 'web'
}
