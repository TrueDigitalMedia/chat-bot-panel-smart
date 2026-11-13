/** Shared re-exports for tests and Twilio path. */
export { stripWhatsAppAddress, toE164 } from '@/lib/whatsapp/phone'
export {
  normalizeTwilioInbound,
  extractTwilioReferral,
  compactReferral,
  type TwilioWhatsAppForm,
} from '@/lib/whatsapp/providers/twilio/normalize-inbound'
export {
  normalizeMetaInbound,
  extractMetaMessages,
  extractMetaReferral,
  type MetaInboundMessage,
  type MetaWebhookPayload,
  type MetaInboundEnvelope,
} from '@/lib/whatsapp/providers/meta/normalize-inbound'
