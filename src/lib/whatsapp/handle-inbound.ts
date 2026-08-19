import type { ChannelInbound } from '@/types/channel'
import { upsertLead } from '@/lib/db/leads'
import { logConversationMessage, wasProviderMessageAlreadyProcessed } from '@/lib/db/conversation-messages'
import { routeMessage } from '@/lib/conversation/flow-router'
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

  const lead = await upsertLead('whatsapp', inbound.channelUserId)

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
    ...logMeta,
  })

  if (resolved.callbackData) {
    await logConversationMessage({
      leadId: lead.id,
      direction: 'in',
      channel: 'whatsapp',
      contentType: 'callback',
      body: resolved.callbackData,
      meta: logMeta,
      providerMessageId,
    })
  } else if (resolved.location) {
    await logConversationMessage({
      leadId: lead.id,
      direction: 'in',
      channel: 'whatsapp',
      contentType: 'system',
      body: 'location_shared',
      meta: { ...logMeta, hasLocation: true },
      providerMessageId,
    })
  } else if (resolved.text) {
    await logConversationMessage({
      leadId: lead.id,
      direction: 'in',
      channel: 'whatsapp',
      contentType: 'text',
      body: resolved.text,
      meta: logMeta,
      providerMessageId,
    })
  }

  await routeMessage(lead, resolved, correlationId)
}
