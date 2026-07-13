import { NextRequest, NextResponse } from 'next/server'
import { after } from 'next/server'
import { verifyTelegramWebhook } from '@/lib/telegram/verify'
import { upsertLead } from '@/lib/db/leads'
import { logConversationMessage } from '@/lib/db/conversation-messages'
import { routeMessage } from '@/lib/conversation/flow-router'
import { generateCorrelationId } from '@/lib/correlation'
import type { TelegramUpdate } from '@/types/telegram'

// Rate limiting: simple in-memory map (replace with Redis/KV for multi-instance)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>()
const RATE_LIMIT = 20
const RATE_WINDOW_MS = 60_000

function checkRateLimit(chatId: string): boolean {
  const now = Date.now()
  const entry = rateLimitMap.get(chatId)
  if (!entry || entry.resetAt < now) {
    rateLimitMap.set(chatId, { count: 1, resetAt: now + RATE_WINDOW_MS })
    return true
  }
  entry.count++
  return entry.count <= RATE_LIMIT
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  // Validate secret token before JSON parsing
  if (!verifyTelegramWebhook(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const update = (await request.json()) as TelegramUpdate

  const chatId =
    update.message?.chat.id ?? update.callback_query?.message?.chat.id

  if (!chatId) {
    return NextResponse.json({ status: 'ignored' })
  }

  const inboundText = update.message?.text
  const callbackData = update.callback_query?.data
  const username =
    update.message?.from?.username ?? update.callback_query?.from.username

  console.info('[telegram:in]', {
    chatId: chatId.toString(),
    username: username ?? null,
    type: update.callback_query ? 'callback' : 'message',
    text: inboundText ?? null,
    callback: callbackData ?? null,
  })

  // Rate limiting
  if (!checkRateLimit(chatId.toString())) {
    console.warn('[telegram:in] rate limited', { chatId: chatId.toString() })
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })
  }

  // Return 200 immediately; process in background
  after(async () => {
    const correlationId = generateCorrelationId()
    try {
      const channelUserId = chatId.toString()
      const lead = await upsertLead('telegram', channelUserId, username)
      const inbound = {
        channel: 'telegram' as const,
        channelUserId,
        channelUsername: username,
        text: inboundText ?? '',
        callbackData,
        contactPhone: update.message?.contact?.phone_number,
      }

      if (callbackData) {
        await logConversationMessage({
          leadId: lead.id,
          direction: 'in',
          channel: 'telegram',
          contentType: 'callback',
          body: callbackData,
        })
      } else if (inbound.contactPhone) {
        await logConversationMessage({
          leadId: lead.id,
          direction: 'in',
          channel: 'telegram',
          contentType: 'contact',
          body: inbound.contactPhone,
        })
      } else if (inbound.text) {
        await logConversationMessage({
          leadId: lead.id,
          direction: 'in',
          channel: 'telegram',
          contentType: 'text',
          body: inbound.text,
        })
      }

      console.info('[telegram:route]', {
        correlationId,
        leadId: lead.id,
        channel: lead.channel,
        status: lead.leadStatus,
        phase: lead.currentPhase,
      })
      await routeMessage(lead, inbound, correlationId)
    } catch (err) {
      console.error('[webhook/telegram] Processing error:', err)
    }
  })

  return NextResponse.json({ status: 'received' })
}
