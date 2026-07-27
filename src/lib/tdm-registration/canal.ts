import type { Channel } from '@/types/channel'

/**
 * Maps our internal lowercase Channel to the casing TDM's /api/ai-lead endpoint expects
 * in the "canal" field. Confirmed by TDM's own example payload for whatsapp ("WhatsApp");
 * telegram/web follow the same Title Case convention, not yet independently confirmed.
 */
const CANAL_LABELS: Record<Channel, string> = {
  whatsapp: 'WhatsApp',
  telegram: 'Telegram',
  web: 'Web',
}

export function canalFor(channel: Channel): string {
  return CANAL_LABELS[channel]
}
