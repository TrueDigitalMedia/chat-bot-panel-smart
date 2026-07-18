import { env, isMetaWhatsAppConfigured, isTwilioConfigured } from '@/lib/env'

export type WhatsAppProvider = 'meta' | 'twilio'

/** Active WhatsApp transport. Default: Meta Cloud API (WhatsApp Business). */
export function getWhatsAppProvider(): WhatsAppProvider {
  const raw = (env.WHATSAPP_PROVIDER ?? 'meta').toLowerCase()
  return raw === 'twilio' ? 'twilio' : 'meta'
}

export function isWhatsAppConfigured(): boolean {
  return getWhatsAppProvider() === 'meta' ? isMetaWhatsAppConfigured() : isTwilioConfigured()
}
