/**
 * Channel-agnostic outbound messaging.
 * Domain / conversation code should import from here — never from a channel SDK.
 */
import type { ChannelRecipient } from '@/types/channel'
import type { InlineKeyboardButton } from '@/types/telegram'
import * as telegram from '@/lib/telegram/send'
import * as whatsapp from '@/lib/whatsapp/send'
import { setPendingWaChoices } from '@/lib/whatsapp/pending-choices'
import { logConversationMessage } from '@/lib/db/conversation-messages'

// Shared literal with gps-capture.ts's own GPS_MANUAL_CALLBACK (not imported — this
// module is transport-only and shouldn't depend on conversation-domain modules, which
// themselves already import from here).
const GPS_MANUAL_CALLBACK = 'gps:manual'

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

export async function sendText(to: ChannelRecipient, text: string): Promise<void> {
  switch (to.channel) {
    case 'telegram':
      await telegram.sendText(BigInt(to.channelUserId), text)
      break
    case 'whatsapp':
      await whatsapp.sendWhatsAppText(to.channelUserId, text)
      break
    case 'web':
      // No external SDK to push to — the message is "delivered" by persisting it below;
      // the visitor's browser picks it up on its next GET/POST response (spec 012 research.md R2/R7).
      break
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
      await whatsapp.sendWhatsAppVideo(to.channelUserId, video, caption)
      break
    case 'web':
      // See sendText — persisted below, no external push needed (research.md R2/R7).
      break
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
    case 'whatsapp': {
      const { choices } = await whatsapp.sendWhatsAppKeyboard(
        to.channelUserId,
        text,
        buttons,
      )
      const leadId = leadIdOf(to)
      if (leadId) await setPendingWaChoices(leadId, choices)
      break
    }
    case 'web':
      // No pending-choices workaround needed — the web client renders real buttons
      // straight from `meta.buttons` below and posts the actual callback_data back
      // (research.md R4), same model as Telegram's native inline keyboards.
      break
    default: {
      const _exhaustive: never = to.channel
      throw new Error(`Unknown channel: ${_exhaustive}`)
    }
  }
  await logOut(to, 'keyboard', text, {
    buttons: buttons.flat().map((b) => ({ text: b.text, callback_data: b.callback_data })),
  })
}

/** Ask user for phone — Telegram uses native contact share; WhatsApp skips (id = phone). */
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
      // Same "type it" prompt as the non-Telegram branch above — no native contact-share UI.
      break
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
      break
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

/** Ask user to share GPS — Telegram reply keyboard; WhatsApp text prompt. */
export async function sendLocationRequest(to: ChannelRecipient): Promise<void> {
  switch (to.channel) {
    case 'telegram': {
      const prompt =
        '📍 Para ubicar tu zona de cupo, comparte tu ubicación GPS.\n\n' +
        'Toca el botón 📍 del teclado (abajo) — Telegram pedirá permiso de ubicación (app móvil recomendada).\nSi no puedes compartir GPS, toca «Escribir mi ubicación».'
      await telegram.sendLocationRequest(BigInt(to.channelUserId), prompt)
      await logOut(to, 'keyboard', prompt, { type: 'location_request' })
      break
    }
    case 'whatsapp': {
      const prompt =
        '📍 Para ubicar tu zona de cupo, comparte tu ubicación GPS (pin de WhatsApp) o toca el botón para continuar a mano.'
      await sendInlineKeyboard(to, prompt, [
        [{ text: 'Escribir mi ubicación', callback_data: GPS_MANUAL_CALLBACK }],
      ])
      break
    }
    case 'web': {
      // No native "share location" UI element — the client shows a button that triggers
      // the browser's own geolocation permission prompt (spec 012 research.md R5); the
      // `type: 'location_request'` meta is how the client knows to show it.
      const prompt =
        '📍 Para ubicar tu zona de cupo, comparte tu ubicación — toca «Compartir ubicación» y acepta el permiso del navegador, o escribe tu ubicación (departamento y municipio) si prefieres continuar a mano.'
      await logOut(to, 'text', prompt, { type: 'location_request' })
      break
    }
    default: {
      const _exhaustive: never = to.channel
      throw new Error(`Unknown channel: ${_exhaustive}`)
    }
  }
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
