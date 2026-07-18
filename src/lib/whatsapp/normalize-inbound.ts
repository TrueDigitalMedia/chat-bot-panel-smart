/** Shared re-exports for tests and Twilio path. */
export { stripWhatsAppAddress, toE164 } from '@/lib/whatsapp/phone'
export {
  normalizeTwilioInbound,
  type TwilioWhatsAppForm,
} from '@/lib/whatsapp/providers/twilio/normalize-inbound'
export {
  normalizeMetaInbound,
  extractMetaMessages,
  type MetaWebhookPayload,
} from '@/lib/whatsapp/providers/meta/normalize-inbound'
