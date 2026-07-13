import twilio from 'twilio'
import { env, isTwilioConfigured } from '@/lib/env'
import type { InlineKeyboardButton } from '@/types/telegram'
import { buildNumberedChoices, type WaChoiceMap } from '@/lib/whatsapp/buttons'

function requireTwilio() {
  if (!isTwilioConfigured()) {
    throw new Error(
      'Twilio WhatsApp is not configured (set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM)',
    )
  }
}

function client() {
  requireTwilio()
  return twilio(env.TWILIO_ACCOUNT_SID!, env.TWILIO_AUTH_TOKEN!)
}

function toWhatsAppAddress(channelUserId: string): string {
  const id = channelUserId.startsWith('whatsapp:')
    ? channelUserId
    : `whatsapp:${channelUserId.startsWith('+') ? channelUserId : `+${channelUserId}`}`
  return id
}

export async function sendWhatsAppText(channelUserId: string, text: string): Promise<string | undefined> {
  requireTwilio()
  const to = toWhatsAppAddress(channelUserId)
  console.info('[whatsapp:out]', { to, type: 'text', len: text.length })
  try {
    const msg = await client().messages.create({
      from: env.TWILIO_WHATSAPP_FROM!,
      to,
      body: text,
    })
    console.info('[whatsapp:out] ok', { to, sid: msg.sid })
    return msg.sid
  } catch (err) {
    console.error('[whatsapp:out] error', {
      to,
      error: err instanceof Error ? err.message : String(err),
    })
    throw err
  }
}

export async function sendWhatsAppVideo(
  channelUserId: string,
  videoUrl: string,
  caption?: string,
): Promise<string | undefined> {
  requireTwilio()
  const to = toWhatsAppAddress(channelUserId)
  console.info('[whatsapp:out]', { to, type: 'media', videoUrl })
  try {
    const msg = await client().messages.create({
      from: env.TWILIO_WHATSAPP_FROM!,
      to,
      body: caption || undefined,
      mediaUrl: [videoUrl],
    })
    console.info('[whatsapp:out] ok', { to, sid: msg.sid })
    return msg.sid
  } catch (err) {
    console.warn('[whatsapp:out] media failed — falling back to link', {
      error: err instanceof Error ? err.message : String(err),
    })
    return sendWhatsAppText(
      channelUserId,
      caption ? `${caption}\n${videoUrl}` : videoUrl,
    )
  }
}

/** Send keyboard as numbered text; returns choice map for pendingWaChoices. */
export async function sendWhatsAppKeyboard(
  channelUserId: string,
  text: string,
  buttons: InlineKeyboardButton[][],
): Promise<{ sid?: string; choices: WaChoiceMap }> {
  const { bodySuffix, choices } = buildNumberedChoices(buttons)
  const sid = await sendWhatsAppText(channelUserId, `${text}${bodySuffix}`)
  return { sid, choices }
}
