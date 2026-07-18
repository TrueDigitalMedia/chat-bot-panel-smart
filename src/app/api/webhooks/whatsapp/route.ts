import { NextRequest, NextResponse } from 'next/server'
import { after } from 'next/server'
import { isMetaWhatsAppConfigured, isTwilioConfigured } from '@/lib/env'
import { getWhatsAppProvider, isWhatsAppConfigured } from '@/lib/whatsapp/provider'
import { verifyMetaHubChallenge, verifyMetaSignature } from '@/lib/whatsapp/verify'
import {
  extractMetaMessages,
  normalizeMetaInbound,
  normalizeTwilioInbound,
  type MetaWebhookPayload,
} from '@/lib/whatsapp/normalize-inbound'
import { toE164 } from '@/lib/whatsapp/phone'
import { getPendingWaChoices } from '@/lib/whatsapp/pending-choices'
import { processWhatsAppInbound } from '@/lib/whatsapp/handle-inbound'
import { upsertLead } from '@/lib/db/leads'
import { verifyTwilioSignature, resolveTwilioWebhookUrl } from '@/lib/whatsapp/verify'

/**
 * Primary WhatsApp webhook.
 * - GET: Meta hub verification
 * - POST: Meta Cloud API (default) or Twilio form when WHATSAPP_PROVIDER=twilio
 *
 * Twilio alternative URL (always): POST /api/webhooks/whatsapp/twilio
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const sp = request.nextUrl.searchParams
  const mode = sp.get('hub.mode')
  const token = sp.get('hub.verify_token')
  const challengeParam = sp.get('hub.challenge')
  const challenge = verifyMetaHubChallenge(mode, token, challengeParam)
  if (challenge === null) {
    console.warn('[whatsapp:meta:hub] verify failed', {
      mode,
      tokenMatch: Boolean(token && token === process.env.WHATSAPP_VERIFY_TOKEN),
      hasChallenge: Boolean(challengeParam),
    })
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  console.info('[whatsapp:meta:hub] verified ok')
  return new NextResponse(challenge, {
    status: 200,
    headers: { 'Content-Type': 'text/plain' },
  })
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const provider = getWhatsAppProvider()

  if (provider === 'twilio') {
    return handleTwilioPost(request)
  }
  return handleMetaPost(request)
}

async function handleMetaPost(request: NextRequest): Promise<NextResponse> {
  if (!isMetaWhatsAppConfigured()) {
    console.warn('[whatsapp] Meta Cloud API not configured — rejecting webhook')
    return NextResponse.json({ error: 'WhatsApp not configured' }, { status: 503 })
  }

  const rawBody = await request.text()
  const signature = request.headers.get('X-Hub-Signature-256')
  if (!verifyMetaSignature(signature, rawBody)) {
    console.warn('[whatsapp:meta:signature] invalid')
    return NextResponse.json({ error: 'Invalid signature' }, { status: 403 })
  }

  let payload: MetaWebhookPayload
  try {
    payload = JSON.parse(rawBody) as MetaWebhookPayload
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  after(async () => {
    try {
      const messages = extractMetaMessages(payload)
      for (const message of messages) {
        const from = message.from
        if (!from) continue
        const lead = await upsertLead('whatsapp', toE164(from))
        const pending = await getPendingWaChoices(lead.id)
        const inbound = normalizeMetaInbound(message, pending)
        if (!inbound) continue
        await processWhatsAppInbound(inbound, { messageId: message.id, provider: 'meta' })
      }
    } catch (err) {
      console.error('[webhook/whatsapp:meta] Processing error:', err)
    }
  })

  return NextResponse.json({ status: 'received' })
}

async function handleTwilioPost(request: NextRequest): Promise<NextResponse> {
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
    console.warn('[whatsapp:twilio:signature] invalid', { webhookUrl })
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
      console.error('[webhook/whatsapp:twilio] Processing error:', err)
    }
  })

  return new NextResponse('', { status: 200 })
}

/** Used by health/docs — keep export for clarity. */
export function whatsappWebhookReady(): boolean {
  return isWhatsAppConfigured()
}
