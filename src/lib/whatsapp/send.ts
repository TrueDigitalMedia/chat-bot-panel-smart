/**
 * WhatsApp outbound facade — dispatches to Meta (primary) or Twilio (alternative).
 */
import type { InlineKeyboardButton } from '@/types/telegram'
import type { WaChoiceMap } from '@/lib/whatsapp/buttons'
import { getWhatsAppProvider } from '@/lib/whatsapp/provider'
import * as meta from '@/lib/whatsapp/providers/meta/send'
import * as twilio from '@/lib/whatsapp/providers/twilio/send'

export async function sendWhatsAppText(
  channelUserId: string,
  text: string,
): Promise<string | undefined> {
  return getWhatsAppProvider() === 'twilio'
    ? twilio.sendTwilioText(channelUserId, text)
    : meta.sendMetaText(channelUserId, text)
}

export async function sendWhatsAppVideo(
  channelUserId: string,
  videoUrl: string,
  caption?: string,
): Promise<string | undefined> {
  return getWhatsAppProvider() === 'twilio'
    ? twilio.sendTwilioVideo(channelUserId, videoUrl, caption)
    : meta.sendMetaVideo(channelUserId, videoUrl, caption)
}

export async function sendWhatsAppKeyboard(
  channelUserId: string,
  text: string,
  buttons: InlineKeyboardButton[][],
): Promise<{ sid?: string; choices: WaChoiceMap }> {
  return getWhatsAppProvider() === 'twilio'
    ? twilio.sendTwilioKeyboard(channelUserId, text, buttons)
    : meta.sendMetaKeyboard(channelUserId, text, buttons)
}
