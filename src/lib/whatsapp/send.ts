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
import { buildNumberedChoices, type WaChoiceMap } from '@/lib/whatsapp/buttons'
import { getWhatsAppProvider } from '@/lib/whatsapp/provider'
import * as meta from '@/lib/whatsapp/providers/meta/send'
import * as twilio from '@/lib/whatsapp/providers/twilio/send'
import { getApprovedTemplate } from '@/lib/whatsapp/providers/twilio/templates'
import { isTwilioOptOutError } from '@/lib/whatsapp/providers/twilio/errors'

async function logSendFailure(fn: string, channelUserId: string, err: unknown): Promise<void> {
  console.error(`[whatsapp:send] ${fn} failed`, {
    channelUserId,
    error: err instanceof Error ? err.message : String(err),
  })
  // Twilio 21610 = recipient unsubscribed. Record it so the re-engage cadence stops
  // firing nudges that just bounce (dynamic import: this transport module must not
  // pull the conversation/state-machine graph in at load time).
  if (isTwilioOptOutError(err)) {
    const { handleTwilioStop } = await import('@/lib/conversation/handle-twilio-stop')
    await handleTwilioStop(channelUserId)
  }
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
    await logSendFailure('sendWhatsAppText', channelUserId, err)
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
    await logSendFailure('sendWhatsAppVideo', channelUserId, err)
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
    await logSendFailure('sendWhatsAppKeyboard', channelUserId, err)
    return { sid: undefined, choices: {} }
  }
}

/** Sends by pre-approved Twilio Content template when one is registered for
 *  `logicalId`; otherwise (no template yet, Meta-direct provider, or the template
 *  send itself fails) falls back to the existing free-text/dynamic-content keyboard
 *  send — same shape/behavior as sendWhatsAppKeyboard for every other case. */
export async function sendWhatsAppTemplateOrKeyboard(
  channelUserId: string,
  logicalId: string,
  fallbackText: string,
  buttons: InlineKeyboardButton[][],
  contentVariables?: Record<string, string>,
): Promise<{ sid?: string; choices: WaChoiceMap }> {
  if (getWhatsAppProvider() === 'twilio') {
    const template = await getApprovedTemplate(logicalId).catch(() => undefined)
    if (template) {
      try {
        const { choices } = buildNumberedChoices(buttons)
        const sid = await twilio.sendTwilioTemplate(channelUserId, template.contentSid, contentVariables)
        return { sid, choices }
      } catch (err) {
        await logSendFailure('sendWhatsAppTemplateOrKeyboard', channelUserId, err)
        // An opt-out (21610) will bounce on the free-text path too — don't retry it.
        if (isTwilioOptOutError(err)) return { sid: undefined, choices: {} }
        // Otherwise fall through to the free-text/dynamic-content path below.
      }
    }
  }
  return sendWhatsAppKeyboard(channelUserId, fallbackText, buttons)
}

/** Text-only counterpart of sendWhatsAppTemplateOrKeyboard, for templates with no buttons. */
export async function sendWhatsAppTemplateOrText(
  channelUserId: string,
  logicalId: string,
  fallbackText: string,
  contentVariables?: Record<string, string>,
): Promise<string | undefined> {
  if (getWhatsAppProvider() === 'twilio') {
    const template = await getApprovedTemplate(logicalId).catch(() => undefined)
    if (template) {
      try {
        return await twilio.sendTwilioTemplate(channelUserId, template.contentSid, contentVariables)
      } catch (err) {
        await logSendFailure('sendWhatsAppTemplateOrText', channelUserId, err)
        // An opt-out (21610) will bounce on the free-text path too — don't retry it.
        if (isTwilioOptOutError(err)) return undefined
        // Otherwise fall through to the free-text path below.
      }
    }
  }
  return sendWhatsAppText(channelUserId, fallbackText)
}
