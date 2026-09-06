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

/** spec 017 — the `from` WhatsApp address: the lead's bound business number when set,
 *  else the shared default `TWILIO_WHATSAPP_FROM`. `fromNumberId` is E.164 (or already a
 *  `whatsapp:` address). */
function fromAddress(fromNumberId?: string): string {
  if (!fromNumberId) return env.TWILIO_WHATSAPP_FROM!
  const raw = fromNumberId.trim()
  return raw.toLowerCase().startsWith('whatsapp:') ? raw : `whatsapp:${raw}`
}

export async function sendTwilioText(
  channelUserId: string,
  text: string,
  fromNumberId?: string,
): Promise<string | undefined> {
  requireTwilio()
  const to = toWhatsAppAddress(channelUserId)
  const from = fromAddress(fromNumberId)
  console.info('[whatsapp:twilio:out]', { to, from, type: 'text', len: text.length })
  try {
    const msg = await client().messages.create({
      from,
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
  fromNumberId?: string,
): Promise<string | undefined> {
  requireTwilio()
  const to = toWhatsAppAddress(channelUserId)
  const from = fromAddress(fromNumberId)
  console.info('[whatsapp:twilio:out]', { to, from, type: 'media', videoUrl })
  try {
    const msg = await client().messages.create({
      from,
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
      fromNumberId,
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
  fromNumberId?: string,
): Promise<string | undefined> {
  requireTwilio()
  const to = toWhatsAppAddress(channelUserId)
  const from = fromAddress(fromNumberId)
  console.info('[whatsapp:twilio:out]', { to, from, type: 'template', contentSid })
  const msg = await client().messages.create({
    contentSid,
    contentVariables: contentVariables ? JSON.stringify(contentVariables) : undefined,
    from,
    to,
  })
  console.info('[whatsapp:twilio:out] ok', { to, sid: msg.sid, contentSid, template: true })
  return msg.sid
}

export async function sendTwilioKeyboard(
  channelUserId: string,
  text: string,
  buttons: InlineKeyboardButton[][],
  fromNumberId?: string,
): Promise<{ sid?: string; choices: WaChoiceMap }> {
  const flat = flattenButtons(buttons)
  const { choices } = buildNumberedChoices(buttons)
  const to = toWhatsAppAddress(channelUserId)
  const from = fromAddress(fromNumberId)

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
      const sid = await sendTwilioText(channelUserId, `${text}${bodySuffix}`, fromNumberId)
      return { sid, choices }
    }

    const msg = await client().messages.create({
      contentSid,
      from,
      to,
    })
    console.info('[whatsapp:twilio:out] ok', { to, sid: msg.sid, contentSid })
    return { sid: msg.sid, choices }
  } catch (err) {
    console.warn('[whatsapp:twilio:out] interactive failed — numbered fallback', {
      error: err instanceof Error ? err.message : String(err),
    })
    const { bodySuffix } = buildNumberedChoices(buttons)
    const sid = await sendTwilioText(channelUserId, `${text}${bodySuffix}`, fromNumberId)
    return { sid, choices }
  }
}
