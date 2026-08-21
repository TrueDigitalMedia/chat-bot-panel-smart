import twilio from 'twilio'
import { env, isTwilioConfigured } from '@/lib/env'
import type { InlineKeyboardButton } from '@/types/telegram'
import { buildNumberedChoices, type WaChoiceMap } from '@/lib/whatsapp/buttons'
import {
  flattenButtons,
  getOrCreateListPickerContent,
  getOrCreateQuickReplyContent,
} from '@/lib/whatsapp/providers/twilio/content'
import { stripWhatsAppAddress } from '@/lib/whatsapp/phone'

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
  const e164 = stripWhatsAppAddress(channelUserId)
  return e164.startsWith('whatsapp:') ? e164 : `whatsapp:${e164}`
}

export async function sendTwilioText(
  channelUserId: string,
  text: string,
): Promise<string | undefined> {
  requireTwilio()
  const to = toWhatsAppAddress(channelUserId)
  console.info('[whatsapp:twilio:out]', { to, type: 'text', len: text.length })
  try {
    const msg = await client().messages.create({
      from: env.TWILIO_WHATSAPP_FROM!,
      to,
      body: text,
    })
    console.info('[whatsapp:twilio:out] ok', { to, sid: msg.sid })
    return msg.sid
  } catch (err) {
    console.error('[whatsapp:twilio:out] error', {
      to,
      error: err instanceof Error ? err.message : String(err),
    })
    throw err
  }
}

export async function sendTwilioVideo(
  channelUserId: string,
  videoUrl: string,
  caption?: string,
): Promise<string | undefined> {
  requireTwilio()
  const to = toWhatsAppAddress(channelUserId)
  console.info('[whatsapp:twilio:out]', { to, type: 'media', videoUrl })
  try {
    const msg = await client().messages.create({
      from: env.TWILIO_WHATSAPP_FROM!,
      to,
      body: caption || undefined,
      mediaUrl: [videoUrl],
    })
    console.info('[whatsapp:twilio:out] ok', { to, sid: msg.sid })
    return msg.sid
  } catch (err) {
    console.warn('[whatsapp:twilio:out] media failed — falling back to link', {
      error: err instanceof Error ? err.message : String(err),
    })
    return sendTwilioText(
      channelUserId,
      caption ? `${caption}\n${videoUrl}` : videoUrl,
    )
  }
}

/** Sends a pre-approved Content template by fixed SID — no dynamic Content creation.
 *  Throws on failure (unlike the other Twilio send functions) so the caller
 *  (whatsapp/send.ts) can decide whether to retry with the free-text/dynamic path. */
export async function sendTwilioTemplate(
  channelUserId: string,
  contentSid: string,
  contentVariables?: Record<string, string>,
): Promise<string | undefined> {
  requireTwilio()
  const to = toWhatsAppAddress(channelUserId)
  console.info('[whatsapp:twilio:out]', { to, type: 'template', contentSid })
  const msg = await client().messages.create({
    contentSid,
    contentVariables: contentVariables ? JSON.stringify(contentVariables) : undefined,
    from: env.TWILIO_WHATSAPP_FROM!,
    to,
  })
  console.info('[whatsapp:twilio:out] ok', { to, sid: msg.sid, contentSid, template: true })
  return msg.sid
}

export async function sendTwilioKeyboard(
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
      console.info('[whatsapp:twilio:out]', { to, type: 'quick-reply', contentSid, n: flat.length })
    } else if (flat.length <= 10) {
      contentSid = await getOrCreateListPickerContent(text, flat)
      console.info('[whatsapp:twilio:out]', { to, type: 'list-picker', contentSid, n: flat.length })
    } else {
      const { bodySuffix } = buildNumberedChoices(buttons)
      const sid = await sendTwilioText(channelUserId, `${text}${bodySuffix}`)
      return { sid, choices }
    }

    const msg = await client().messages.create({
      contentSid,
      from: env.TWILIO_WHATSAPP_FROM!,
      to,
    })
    console.info('[whatsapp:twilio:out] ok', { to, sid: msg.sid, contentSid })
    return { sid: msg.sid, choices }
  } catch (err) {
    console.warn('[whatsapp:twilio:out] interactive failed — numbered fallback', {
      error: err instanceof Error ? err.message : String(err),
    })
    const { bodySuffix } = buildNumberedChoices(buttons)
    const sid = await sendTwilioText(channelUserId, `${text}${bodySuffix}`)
    return { sid, choices }
  }
}
