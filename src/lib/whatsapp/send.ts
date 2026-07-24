/**
 * WhatsApp outbound facade — dispatches to Meta (primary) or Twilio (alternative).
 *
 * Every function here swallows provider failures (bad/expired token, rate limits,
 * network errors, ...) instead of letting them throw — a delivery failure to WhatsApp
 * must never crash whichever caller triggered it (webhook processing, a QStash job
 * delivering a registration code, an admin reply, ...). By the time we're sending,
 * the bot's own state (transitionLead, etc.) has typically already been persisted, so
 * swallowing here just means the user doesn't receive that one message — not that
 * unrelated request handling breaks.
 */
import type { InlineKeyboardButton } from '@/types/telegram'
import type { WaChoiceMap } from '@/lib/whatsapp/buttons'
import { getWhatsAppProvider } from '@/lib/whatsapp/provider'
import * as meta from '@/lib/whatsapp/providers/meta/send'
import * as twilio from '@/lib/whatsapp/providers/twilio/send'

function logSendFailure(fn: string, channelUserId: string, err: unknown): void {
  console.error(`[whatsapp:send] ${fn} failed`, {
    channelUserId,
    error: err instanceof Error ? err.message : String(err),
  })
}

export async function sendWhatsAppText(
  channelUserId: string,
  text: string,
): Promise<string | undefined> {
  try {
    return await (getWhatsAppProvider() === 'twilio'
      ? twilio.sendTwilioText(channelUserId, text)
      : meta.sendMetaText(channelUserId, text))
  } catch (err) {
    logSendFailure('sendWhatsAppText', channelUserId, err)
    return undefined
  }
}

export async function sendWhatsAppVideo(
  channelUserId: string,
  videoUrl: string,
  caption?: string,
): Promise<string | undefined> {
  try {
    return await (getWhatsAppProvider() === 'twilio'
      ? twilio.sendTwilioVideo(channelUserId, videoUrl, caption)
      : meta.sendMetaVideo(channelUserId, videoUrl, caption))
  } catch (err) {
    logSendFailure('sendWhatsAppVideo', channelUserId, err)
    return undefined
  }
}

export async function sendWhatsAppKeyboard(
  channelUserId: string,
  text: string,
  buttons: InlineKeyboardButton[][],
): Promise<{ sid?: string; choices: WaChoiceMap }> {
  try {
    return await (getWhatsAppProvider() === 'twilio'
      ? twilio.sendTwilioKeyboard(channelUserId, text, buttons)
      : meta.sendMetaKeyboard(channelUserId, text, buttons))
  } catch (err) {
    logSendFailure('sendWhatsAppKeyboard', channelUserId, err)
    return { sid: undefined, choices: {} }
  }
}
