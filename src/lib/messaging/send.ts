/**
 * Channel-agnostic outbound messaging.
 * Domain / conversation code should import from here — never from a channel SDK.
 */
import type { ChannelRecipient } from '@/types/channel'
import type { InlineKeyboardButton } from '@/types/telegram'
import * as telegram from '@/lib/telegram/send'
import * as whatsapp from '@/lib/whatsapp/send'
import { setPendingWaChoices } from '@/lib/whatsapp/pending-choices'
import {
  logConversationMessage,
  getLastOutboundMessage,
  countOutboundSinceLastInbound,
} from '@/lib/db/conversation-messages'

// Shared literal with gps-capture.ts's own GPS_MANUAL_CALLBACK (not imported — this
// module is transport-only and shouldn't depend on conversation-domain modules, which
// themselves already import from here).
const GPS_MANUAL_CALLBACK = 'gps:manual'

function leadIdOf(to: ChannelRecipient): string | undefined {
  const maybe = to as ChannelRecipient & { id?: string }
  return typeof maybe.id === 'string' ? maybe.id : undefined
}

// Generic enough to trail any statement or question (a re-asked gate, a resent survey
// question, a repeated support redirect) without reading oddly — indexed by how many
// consecutive times the same message has gone out, capped at the last entry.
const REPEAT_NUDGES = ['', '\n\n(Sigo por aquí 👋)', '\n\n(Aquí sigo, cuando quieras 🙂)', '\n\n(Seguimos en contacto 🙏)']

// Deterministic circuit breaker: once the exact same text would go out this many times
// in a row to the same lead, stop sending it entirely — regardless of which caller or AI
// decision produced it. Backstop for cases where the upstream "should I even reply"
// logic misjudges or a duplicate webhook delivery slips through (see
// wasProviderMessageAlreadyProcessed) — a real conversation loop was observed in
// production sending the same canned message dozens of times over ~2h.
const MAX_CONSECUTIVE_REPEATS = 3

// Text-agnostic circuit breaker (unlike dedupeRepeat, which only catches byte-identical
// consecutive text): once this many outbound messages have piled up without a single
// inbound reply from the lead, send nothing more. This is the last-resort backstop for
// the "spaced burst" pattern — 4–7 different business messages over hours with no reply —
// that drops Meta's quality rating. The orderly path (marking the lead terminal) is the
// re-engage job's `skipped_outbound_ceiling` branch; this only stops the bleeding if that
// never runs. Calibrated just above the largest legitimate no-reply burst (a code
// delivery is code + video + instructions = 3 messages) and one above
// REENGAGE_OUTBOUND_CEILING (4) so the orderly termination always fires first.
const MAX_OUTBOUND_WITHOUT_REPLY = 5

/** True when the lead has already received MAX_OUTBOUND_WITHOUT_REPLY outbound messages
 *  since their last inbound — see the constant above. Transport-only: callers just skip
 *  the send; lead-status changes happen in the domain layer (jobs/re-engage). */
async function exceededOutboundCeiling(leadId: string | undefined): Promise<boolean> {
  if (!leadId) return false
  const n = await countOutboundSinceLastInbound(leadId)
  if (n >= MAX_OUTBOUND_WITHOUT_REPLY) {
    console.warn('[messaging] outbound-without-reply ceiling: suppressing send', { leadId, count: n })
    return true
  }
  return false
}

interface DedupeResult {
  text: string
  meta: { dedupeBase: string; dedupeIndex: number }
  suppress: boolean
}

/**
 * Never send the exact same text twice in a row to the same lead — many gates/questions
 * re-show byte-identical prompts when the user's reply didn't resolve to anything (see
 * flow-router.ts's waiting_for_code reminder, phase-1.ts's NOT_UNDERSTOOD_MESSAGE +
 * re-ask combo, survey question resends, etc.), which reads as broken/robotic.
 *
 * Tracks the repeat run via `meta.dedupeBase`/`dedupeIndex` on the previous message
 * rather than comparing raw bodies directly, so appending a nudge doesn't itself break
 * the chain (an already-nudged message's dedupeBase is still the original text). Once
 * the run hits MAX_CONSECUTIVE_REPEATS, `suppress: true` tells the caller to send
 * nothing at all rather than nudge again.
 */
async function dedupeRepeat(leadId: string | undefined, text: string): Promise<DedupeResult> {
  if (!leadId) return { text, meta: { dedupeBase: text, dedupeIndex: 0 }, suppress: false }
  const last = await getLastOutboundMessage(leadId)
  const lastBase = (last?.meta?.dedupeBase as string | undefined) ?? last?.body
  if (!last || lastBase !== text) {
    return { text, meta: { dedupeBase: text, dedupeIndex: 0 }, suppress: false }
  }
  const dedupeIndex = ((last.meta?.dedupeIndex as number | undefined) ?? 0) + 1
  if (dedupeIndex >= MAX_CONSECUTIVE_REPEATS) {
    return { text, meta: { dedupeBase: text, dedupeIndex }, suppress: true }
  }
  const nudge = REPEAT_NUDGES[Math.min(dedupeIndex, REPEAT_NUDGES.length - 1)]
  return { text: text + nudge, meta: { dedupeBase: text, dedupeIndex }, suppress: false }
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

export async function sendText(
  to: ChannelRecipient,
  text: string,
  extraMeta?: Record<string, unknown>,
): Promise<void> {
  if (await exceededOutboundCeiling(leadIdOf(to))) return
  const { text: outText, meta, suppress } = await dedupeRepeat(leadIdOf(to), text)
  if (suppress) {
    console.warn('[messaging] repeat circuit breaker: suppressing send', { leadId: leadIdOf(to), dedupeIndex: meta.dedupeIndex })
    return
  }
  switch (to.channel) {
    case 'telegram':
      await telegram.sendText(BigInt(to.channelUserId), outText)
      break
    case 'whatsapp':
      await whatsapp.sendWhatsAppText(to.channelUserId, outText)
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
  await logOut(to, 'text', outText, { ...extraMeta, ...meta })
}

export async function sendVideo(
  to: ChannelRecipient,
  video: string,
  caption?: string,
): Promise<void> {
  if (await exceededOutboundCeiling(leadIdOf(to))) return
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
  extraMeta?: Record<string, unknown>,
): Promise<void> {
  if (await exceededOutboundCeiling(leadIdOf(to))) return
  const { text: outText, meta: dedupeMeta, suppress } = await dedupeRepeat(leadIdOf(to), text)
  if (suppress) {
    console.warn('[messaging] repeat circuit breaker: suppressing send', {
      leadId: leadIdOf(to),
      dedupeIndex: dedupeMeta.dedupeIndex,
    })
    return
  }
  switch (to.channel) {
    case 'telegram':
      await telegram.sendInlineKeyboard(BigInt(to.channelUserId), outText, buttons)
      break
    case 'whatsapp': {
      const { choices } = await whatsapp.sendWhatsAppKeyboard(
        to.channelUserId,
        outText,
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
  await logOut(to, 'keyboard', outText, {
    buttons: buttons.flat().map((b) => ({ text: b.text, callback_data: b.callback_data })),
    ...extraMeta,
    ...dedupeMeta,
  })
}

/** Same as sendInlineKeyboard, but on WhatsApp/Twilio prefers a pre-approved Content
 *  template (by `logicalId`) when one is registered — falling back to the same
 *  dynamic/free-text keyboard send otherwise. Telegram and web ignore `logicalId`
 *  entirely and behave exactly like sendInlineKeyboard. */
export async function sendTemplateOrKeyboard(
  to: ChannelRecipient,
  logicalId: string,
  text: string,
  buttons: InlineKeyboardButton[][],
  opts?: { contentVariables?: Record<string, string>; extraMeta?: Record<string, unknown> },
): Promise<void> {
  if (await exceededOutboundCeiling(leadIdOf(to))) return
  const { text: outText, meta: dedupeMeta, suppress } = await dedupeRepeat(leadIdOf(to), text)
  if (suppress) {
    console.warn('[messaging] repeat circuit breaker: suppressing send', {
      leadId: leadIdOf(to),
      dedupeIndex: dedupeMeta.dedupeIndex,
    })
    return
  }
  switch (to.channel) {
    case 'telegram':
      await telegram.sendInlineKeyboard(BigInt(to.channelUserId), outText, buttons)
      break
    case 'whatsapp': {
      const { choices } = await whatsapp.sendWhatsAppTemplateOrKeyboard(
        to.channelUserId,
        logicalId,
        outText,
        buttons,
        opts?.contentVariables,
      )
      const leadId = leadIdOf(to)
      if (leadId) await setPendingWaChoices(leadId, choices)
      break
    }
    case 'web':
      break
    default: {
      const _exhaustive: never = to.channel
      throw new Error(`Unknown channel: ${_exhaustive}`)
    }
  }
  await logOut(to, 'keyboard', outText, {
    buttons: buttons.flat().map((b) => ({ text: b.text, callback_data: b.callback_data })),
    templateLogicalId: logicalId,
    ...opts?.extraMeta,
    ...dedupeMeta,
  })
}

/** Same as sendText, but on WhatsApp/Twilio prefers a pre-approved Content template
 *  (by `logicalId`, no buttons) when one is registered — falling back to plain
 *  sendText otherwise. Telegram and web ignore `logicalId` entirely. */
export async function sendTemplateOrText(
  to: ChannelRecipient,
  logicalId: string,
  text: string,
  opts?: { contentVariables?: Record<string, string>; extraMeta?: Record<string, unknown> },
): Promise<void> {
  if (await exceededOutboundCeiling(leadIdOf(to))) return
  const { text: outText, meta: dedupeMeta, suppress } = await dedupeRepeat(leadIdOf(to), text)
  if (suppress) {
    console.warn('[messaging] repeat circuit breaker: suppressing send', { leadId: leadIdOf(to), dedupeIndex: dedupeMeta.dedupeIndex })
    return
  }
  switch (to.channel) {
    case 'telegram':
      await telegram.sendText(BigInt(to.channelUserId), outText)
      break
    case 'whatsapp':
      await whatsapp.sendWhatsAppTemplateOrText(to.channelUserId, logicalId, outText, opts?.contentVariables)
      break
    case 'web':
      break
    default: {
      const _exhaustive: never = to.channel
      throw new Error(`Unknown channel: ${_exhaustive}`)
    }
  }
  await logOut(to, 'text', outText, { templateLogicalId: logicalId, ...opts?.extraMeta, ...dedupeMeta })
}

/**
 * Ask user for phone — Telegram uses native contact share; WhatsApp/web get a plain
 * text prompt. WhatsApp normally never reaches here at all (id = phone, resolved
 * automatically before phone-capture.ts's needsPhoneCapture would ever say yes) — this
 * only fires for the BSUID edge case (see phone.ts's channelRequiresPhonePrompt), where
 * there's genuinely no phone to fall back on and the user has to type one.
 */
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
      await whatsapp.sendWhatsAppText(to.channelUserId, prompt)
      break
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
        [{ text: 'Escribir ubicación', callback_data: GPS_MANUAL_CALLBACK }],
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
