import { NextRequest, NextResponse } from 'next/server'
import { after } from 'next/server'
import { isTwilioConfigured } from '@/lib/env'
import { verifyTwilioSignature, resolveTwilioWebhookUrl } from '@/lib/whatsapp/verify'
import { normalizeTwilioInbound } from '@/lib/whatsapp/normalize-inbound'
import {
  clearPendingWaChoices,
  getPendingWaChoices,
} from '@/lib/whatsapp/pending-choices'
import { upsertLead } from '@/lib/db/leads'
import { logConversationMessage } from '@/lib/db/conversation-messages'
import { routeMessage } from '@/lib/conversation/flow-router'
import { generateCorrelationId } from '@/lib/correlation'

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!isTwilioConfigured()) {
    console.warn('[whatsapp] Twilio not configured — rejecting webhook')
    return NextResponse.json({ error: 'WhatsApp not configured' }, { status: 503 })
  }

  const formData = await request.formData()
  const params: Record<string, string> = {}
  formData.forEach((value, key) => {
    if (typeof value === 'string') params[key] = value
  })

  const signature = request.headers.get('X-Twilio-Signature')
  const webhookUrl = resolveTwilioWebhookUrl(request.url)

  if (!verifyTwilioSignature(signature, webhookUrl, params)) {
    console.warn('[whatsapp:signature] invalid', { webhookUrl })
    return NextResponse.json({ error: 'Invalid signature' }, { status: 403 })
  }

  // ACK immediately; process in background
  after(async () => {
    const correlationId = generateCorrelationId()
    try {
      const from = params.From || ''
      if (!from) return

      const channelUserId = from.replace(/^whatsapp:/i, '').trim()
      const lead = await upsertLead('whatsapp', channelUserId)

      const pending = await getPendingWaChoices(lead.id)
      const inbound = normalizeTwilioInbound(params, pending)

      if (inbound.callbackData && pending) {
        await clearPendingWaChoices(lead.id)
      }

      console.info('[whatsapp:in]', {
        correlationId,
        leadId: lead.id,
        from: channelUserId,
        messageSid: params.MessageSid ?? null,
        hasLocation: Boolean(inbound.location),
        hasCallback: Boolean(inbound.callbackData),
        textPreview: inbound.text?.slice(0, 80) || null,
      })

      if (inbound.callbackData) {
        await logConversationMessage({
          leadId: lead.id,
          direction: 'in',
          channel: 'whatsapp',
          contentType: 'callback',
          body: inbound.callbackData,
          meta: { messageSid: params.MessageSid },
        })
      } else if (inbound.location) {
        await logConversationMessage({
          leadId: lead.id,
          direction: 'in',
          channel: 'whatsapp',
          contentType: 'system',
          body: 'location_shared',
          meta: { messageSid: params.MessageSid, hasLocation: true },
        })
      } else if (inbound.text) {
        await logConversationMessage({
          leadId: lead.id,
          direction: 'in',
          channel: 'whatsapp',
          contentType: 'text',
          body: inbound.text,
          meta: { messageSid: params.MessageSid },
        })
      }

      await routeMessage(lead, inbound, correlationId)
    } catch (err) {
      console.error('[webhook/whatsapp] Processing error:', err)
    }
  })

  return new NextResponse('', { status: 200 })
}
