import { and, count, eq } from 'drizzle-orm'
import type { ChannelInbound } from '@/types/channel'
import { recordLeadAdReferral, upsertLead } from '@/lib/db/leads'
import { logConversationMessage, wasProviderMessageAlreadyProcessed } from '@/lib/db/conversation-messages'
import { db } from '@/lib/db/client'
import { conversationMessages } from '@/lib/db/schema'
import { routeMessage } from '@/lib/conversation/flow-router'
import { applyNumberScope } from '@/lib/whatsapp/number-scope'
import { generateCorrelationId } from '@/lib/correlation'
import {
  clearPendingWaChoices,
  getPendingWaChoices,
} from '@/lib/whatsapp/pending-choices'

/**
 * Shared WhatsApp inbound pipeline (Meta or Twilio → same ChannelInbound).
 */
export async function processWhatsAppInbound(
  inbound: ChannelInbound,
  logMeta?: Record<string, unknown>,
): Promise<void> {
  const correlationId = generateCorrelationId()

  // WhatsApp/Twilio can redeliver the same webhook call (slow ack, transient error,
  // network blip) — without this check a redelivery re-runs routing/AI/send from
  // scratch, producing a duplicate reply to the user. See wasProviderMessageAlreadyProcessed.
  const providerMessageId =
    (logMeta?.messageId as string | undefined) ?? (logMeta?.messageSid as string | undefined)
  if (providerMessageId && (await wasProviderMessageAlreadyProcessed('whatsapp', providerMessageId))) {
    console.info('[whatsapp:in] duplicate delivery skipped', { correlationId, providerMessageId, ...logMeta })
    return
  }

  const lead = await upsertLead('whatsapp', inbound.channelUserId, undefined, {
    phoneNumberId: inbound.whatsappPhoneNumberId,
  })

  // Atribución click-to-WhatsApp (Meta Ads). Va a dos lados a propósito:
  //  - a `meta.referral` de conversation_messages, en cada toque que lo traiga, como
  //    bitácora cruda de lo que mandó el proveedor;
  //  - a las columnas leads.ad_* vía recordLeadAdReferral, que sella solo el primer toque.
  // El try/catch es deliberado: un fallo de atribución (columna faltante, timeout) jamás
  // puede frenar la conversación del lead, que es lo único que no se puede recuperar después.
  let referralLogMeta = logMeta
  if (inbound.adReferral) {
    referralLogMeta = { ...logMeta, referral: inbound.adReferral }
    try {
      await recordLeadAdReferral(lead.id, inbound.adReferral)
    } catch (error) {
      console.error('[whatsapp:in] no se pudo guardar la atribución del anuncio', {
        correlationId,
        leadId: lead.id,
        error,
      })
    }
  }

  // spec 017 — a brand-new conversation on a country-scoped business number is pre-set to
  // that country here (before routeMessage), so the existing survey-plan skip logic
  // (feature 016) never sends the "¿En qué país…?" question. Never re-scopes an existing
  // lead. `country`-skip + manual-geo behavior is owned by feature 016 — nothing new here.
  const [{ n: existingMessageCount } = { n: 0 }] = await db
    .select({ n: count() })
    .from(conversationMessages)
    .where(and(eq(conversationMessages.leadId, lead.id)))
  await applyNumberScope(
    lead.id,
    inbound.whatsappPhoneNumberId,
    lead.whatsappPhoneNumberId,
    Number(existingMessageCount),
  )

  const pending = await getPendingWaChoices(lead.id)
  let resolved = inbound

  // Re-resolve numbered/label replies if normalize didn't have pending yet
  if (!resolved.callbackData && pending && resolved.text) {
    const key = resolved.text.trim().toLowerCase()
    const mapped = pending[key] || pending[resolved.text.trim()]
    if (mapped) {
      resolved = { ...resolved, callbackData: mapped, text: '' }
    }
  }

  if (resolved.callbackData && pending) {
    await clearPendingWaChoices(lead.id)
  }

  console.info('[whatsapp:in]', {
    correlationId,
    leadId: lead.id,
    from: resolved.channelUserId,
    hasLocation: Boolean(resolved.location),
    hasCallback: Boolean(resolved.callbackData),
    textPreview: resolved.text?.slice(0, 80) || null,
    ...referralLogMeta,
  })

  if (resolved.callbackData) {
    await logConversationMessage({
      leadId: lead.id,
      direction: 'in',
      channel: 'whatsapp',
      contentType: 'callback',
      body: resolved.callbackData,
      meta: referralLogMeta,
      providerMessageId,
    })
  } else if (resolved.location) {
    await logConversationMessage({
      leadId: lead.id,
      direction: 'in',
      channel: 'whatsapp',
      contentType: 'system',
      body: 'location_shared',
      meta: { ...referralLogMeta, hasLocation: true },
      providerMessageId,
    })
  } else if (resolved.text) {
    await logConversationMessage({
      leadId: lead.id,
      direction: 'in',
      channel: 'whatsapp',
      contentType: 'text',
      body: resolved.text,
      meta: referralLogMeta,
      providerMessageId,
    })
  }

  await routeMessage(lead, resolved, correlationId)
}
