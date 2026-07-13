import twilio from 'twilio'
import { env, isTwilioConfigured } from '@/lib/env'
import type { InlineKeyboardButton } from '@/types/telegram'
import { buildNumberedChoices, type WaChoiceMap } from '@/lib/whatsapp/buttons'
import {
  flattenButtons,
  getOrCreateListPickerContent,
  getOrCreateQuickReplyContent,
} from '@/lib/whatsapp/content'

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

/**
 * Prefer native WhatsApp quick-reply (≤3) or list-picker (4–10).
 * Falls back to numbered text if Content API fails.
 */
export async function sendWhatsAppKeyboard(
  channelUserId: string,
  text: string,
  buttons: InlineKeyboardButton[][],
): Promise<{ sid?: string; choices: WaChoiceMap }> {
  const flat = flattenButtons(buttons)
  const { choices } = buildNumberedChoices(buttons)
  const to = toWhatsAppAddress(channelUserId)

  try {
    requireTwilio()
    let contentSid: string
    if (flat.length > 0 && flat.length <= 3) {
      contentSid = await getOrCreateQuickReplyContent(text, flat)
      console.info('[whatsapp:out]', { to, type: 'quick-reply', contentSid, n: flat.length })
    } else if (flat.length <= 10) {
      contentSid = await getOrCreateListPickerContent(text, flat)
      console.info('[whatsapp:out]', { to, type: 'list-picker', contentSid, n: flat.length })
    } else {
      const { bodySuffix } = buildNumberedChoices(buttons)
      const sid = await sendWhatsAppText(channelUserId, `${text}${bodySuffix}`)
      return { sid, choices }
    }

    const msg = await client().messages.create({
      contentSid,
      from: env.TWILIO_WHATSAPP_FROM!,
      to,
    })
    console.info('[whatsapp:out] ok', { to, sid: msg.sid, contentSid })
    return { sid: msg.sid, choices }
  } catch (err) {
    console.warn('[whatsapp:out] interactive failed — numbered fallback', {
      error: err instanceof Error ? err.message : String(err),
    })
    const { bodySuffix } = buildNumberedChoices(buttons)
    const sid = await sendWhatsAppText(channelUserId, `${text}${bodySuffix}`)
    return { sid, choices }
  }
}
