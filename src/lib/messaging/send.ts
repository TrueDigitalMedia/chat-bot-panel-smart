import type { ChannelRecipient } from '@/types/channel'
import type { InlineKeyboardButton } from '@/types/telegram'
import * as telegram from '@/lib/telegram/send'
import { logConversationMessage } from '@/lib/db/conversation-messages'

function leadIdOf(to: ChannelRecipient): string | undefined {
  const maybe = to as ChannelRecipient & { id?: string }
  return typeof maybe.id === 'string' ? maybe.id : undefined
}

async function logOut(
  to: ChannelRecipient,
  contentType: 'text' | 'keyboard' | 'video' | 'system',
  body: string,
  meta?: Record<string, unknown>,
): Promise<void> {
  const leadId = leadIdOf(to)
  if (!leadId) return
  await logConversationMessage({
    leadId,
    direction: 'out',
    channel: to.channel,
    contentType,
    body,
    meta,
  })
}

/**
 * Channel-agnostic outbound messaging.
 * Domain / conversation code should import from here — never from a channel SDK.
 */
export async function sendText(to: ChannelRecipient, text: string): Promise<void> {
  switch (to.channel) {
    case 'telegram':
      await telegram.sendText(BigInt(to.channelUserId), text)
      break
    case 'whatsapp':
    case 'web':
      throw new Error(`Outbound messaging not implemented for channel: ${to.channel}`)
    default: {
      const _exhaustive: never = to.channel
      throw new Error(`Unknown channel: ${_exhaustive}`)
    }
  }
  await logOut(to, 'text', text)
}

export async function sendVideo(
  to: ChannelRecipient,
  video: string,
  caption?: string,
): Promise<void> {
  switch (to.channel) {
    case 'telegram':
      await telegram.sendVideo(BigInt(to.channelUserId), video, caption)
      break
    case 'whatsapp':
    case 'web':
      throw new Error(`Outbound video not implemented for channel: ${to.channel}`)
    default: {
      const _exhaustive: never = to.channel
      throw new Error(`Unknown channel: ${_exhaustive}`)
    }
  }
  await logOut(to, 'video', caption ?? video, { video })
}

export async function sendInlineKeyboard(
  to: ChannelRecipient,
  text: string,
  buttons: InlineKeyboardButton[][],
): Promise<void> {
  switch (to.channel) {
    case 'telegram':
      await telegram.sendInlineKeyboard(BigInt(to.channelUserId), text, buttons)
      break
    case 'whatsapp':
    case 'web':
      throw new Error(`Outbound keyboard not implemented for channel: ${to.channel}`)
    default: {
      const _exhaustive: never = to.channel
      throw new Error(`Unknown channel: ${_exhaustive}`)
    }
  }
  await logOut(to, 'keyboard', text, {
    buttons: buttons.flat().map((b) => ({ text: b.text, callback_data: b.callback_data })),
  })
}

/** Ask user for phone — Telegram uses native contact share; web uses typed number. */
export async function sendPhoneRequest(to: ChannelRecipient): Promise<void> {
  const prompt =
    'Para continuar necesitamos tu número de teléfono.\n\n' +
    (to.channel === 'telegram'
      ? 'Toca «Compartir mi número» o escríbelo con código de país (ej. +50255551234).'
      : 'Escríbelo con código de país (ej. +50255551234).')

  switch (to.channel) {
    case 'telegram':
      await telegram.sendContactRequest(BigInt(to.channelUserId), prompt)
      break
    case 'web':
      throw new Error('Outbound messaging not implemented for channel: web')
    case 'whatsapp':
      return
    default: {
      const _exhaustive: never = to.channel
      throw new Error(`Unknown channel: ${_exhaustive}`)
    }
  }
  await logOut(to, 'keyboard', prompt, { type: 'contact_request' })
}

export async function confirmPhoneSaved(to: ChannelRecipient, phone: string): Promise<void> {
  const msg = `✅ Número guardado: ${phone}`
  switch (to.channel) {
    case 'telegram':
      await telegram.removeReplyKeyboard(BigInt(to.channelUserId), msg)
      break
    case 'web':
      throw new Error('Outbound messaging not implemented for channel: web')
    case 'whatsapp':
      await sendText(to, msg)
      return
    default: {
      const _exhaustive: never = to.channel
      throw new Error(`Unknown channel: ${_exhaustive}`)
    }
  }
  await logOut(to, 'text', msg)
}

/** Ask user to share GPS — Telegram reply keyboard; WhatsApp reserved. */
export async function sendLocationRequest(to: ChannelRecipient): Promise<void> {
  const prompt =
    '📍 Para ubicar tu zona de cupo, comparte tu ubicación GPS.\n\n' +
    (to.channel === 'telegram'
      ? 'Toca «Compartir ubicación» o «Escribir mi ubicación» si prefieres responder a mano.'
      : 'Comparte tu ubicación cuando el canal lo permita.')

  switch (to.channel) {
    case 'telegram':
      await telegram.sendLocationRequest(BigInt(to.channelUserId), prompt)
      break
    case 'whatsapp':
    case 'web':
      throw new Error(`Location request not implemented for channel: ${to.channel}`)
    default: {
      const _exhaustive: never = to.channel
      throw new Error(`Unknown channel: ${_exhaustive}`)
    }
  }
  await logOut(to, 'keyboard', prompt, { type: 'location_request' })
}

export async function confirmLocationKeyboardRemoved(
  to: ChannelRecipient,
  text: string,
): Promise<void> {
  switch (to.channel) {
    case 'telegram':
      await telegram.removeReplyKeyboard(BigInt(to.channelUserId), text)
      break
    case 'whatsapp':
    case 'web':
      await sendText(to, text)
      return
    default: {
      const _exhaustive: never = to.channel
      throw new Error(`Unknown channel: ${_exhaustive}`)
    }
  }
  await logOut(to, 'text', text)
}
