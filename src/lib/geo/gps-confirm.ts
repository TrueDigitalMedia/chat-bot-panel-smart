import { sendInlineKeyboard } from '@/lib/messaging/send'
import type { PlaceProposal } from '@/lib/geo/reverse-geocode'
import { formatGpsConfirmText } from '@/lib/geo/gps-confirm-format'
import type { ChannelRecipient } from '@/types/channel'

export const GPS_YES = 'gps:yes'
export const GPS_NO = 'gps:no'

export { formatGpsConfirmText }

export function isGpsConfirmCallback(data: string | undefined): boolean {
  return data === GPS_YES || data === GPS_NO
}

export async function askGpsConfirmation(
  to: ChannelRecipient,
  proposal: PlaceProposal,
): Promise<void> {
  await sendInlineKeyboard(to, formatGpsConfirmText(proposal), [
    [
      { text: 'Sí, es correcto', callback_data: GPS_YES },
      { text: 'No, corregir', callback_data: GPS_NO },
    ],
  ])
}
