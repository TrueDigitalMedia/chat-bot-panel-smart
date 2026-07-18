import { NextRequest, NextResponse } from 'next/server'
import { after } from 'next/server'
import { isTwilioConfigured } from '@/lib/env'
import { verifyTwilioSignature, resolveTwilioWebhookUrl } from '@/lib/whatsapp/verify'
import { normalizeTwilioInbound } from '@/lib/whatsapp/normalize-inbound'
import { getPendingWaChoices } from '@/lib/whatsapp/pending-choices'
import { processWhatsAppInbound } from '@/lib/whatsapp/handle-inbound'
import { upsertLead } from '@/lib/db/leads'

/**
 * Twilio WhatsApp alternative webhook.
 * Point Twilio Console "When a message comes in" here when using Twilio
 * (or when Meta is primary but you still want a Twilio sandbox for tests).
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!isTwilioConfigured()) {
    console.warn('[whatsapp/twilio] Twilio not configured — rejecting webhook')
    return NextResponse.json({ error: 'Twilio WhatsApp not configured' }, { status: 503 })
  }

  const formData = await request.formData()
  const params: Record<string, string> = {}
  formData.forEach((value, key) => {
    if (typeof value === 'string') params[key] = value
  })

  const signature = request.headers.get('X-Twilio-Signature')
  const webhookUrl = resolveTwilioWebhookUrl(request.url)

  if (!verifyTwilioSignature(signature, webhookUrl, params)) {
    console.warn('[whatsapp/twilio:signature] invalid', { webhookUrl })
    return NextResponse.json({ error: 'Invalid signature' }, { status: 403 })
  }

  after(async () => {
    try {
      const from = params.From || ''
      if (!from) return
      const lead = await upsertLead('whatsapp', from.replace(/^whatsapp:/i, '').trim())
      const pending = await getPendingWaChoices(lead.id)
      const inbound = normalizeTwilioInbound(params, pending)
      await processWhatsAppInbound(inbound, {
        messageSid: params.MessageSid,
        provider: 'twilio',
      })
    } catch (err) {
      console.error('[webhook/whatsapp/twilio] Processing error:', err)
    }
  })

  return new NextResponse('', { status: 200 })
}
