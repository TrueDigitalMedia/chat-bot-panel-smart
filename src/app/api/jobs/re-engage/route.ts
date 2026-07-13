import { NextRequest, NextResponse } from 'next/server'
import { Receiver } from '@upstash/qstash'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { leads, reEngagementSchedules } from '@/lib/db/schema'
import { transitionLead } from '@/lib/state-machine'
import { triggerRegistrationCode } from '@/lib/onboarding/mock-registration'
import {
  REGISTER_CALLBACK_NO,
  REGISTER_CALLBACK_YES,
} from '@/lib/onboarding/registration-choice'
import { sendText, sendVideo, sendInlineKeyboard } from '@/lib/messaging/send'
import { scheduleJob } from '@/lib/scheduler/re-engagement'
import { REENGAGEMENT_DELAY_SECONDS, MAX_REENGAGEMENT_ATTEMPTS } from '@/lib/scheduler/constants'
import { getReEngagementMessage } from '@/lib/scheduler/messages'
import { generateCorrelationId } from '@/lib/correlation'
import { env } from '@/lib/env'
import type { JobPayload } from '@/lib/scheduler/re-engagement'

const ONBOARDING_VIDEO = process.env.ONBOARDING_VIDEO_URL ?? ''

const receiver = new Receiver({
  currentSigningKey: env.QSTASH_CURRENT_SIGNING_KEY,
  nextSigningKey: env.QSTASH_NEXT_SIGNING_KEY,
})

export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = await request.text()
  const signature = request.headers.get('Upstash-Signature') ?? ''
  const isValid = await receiver.verify({ signature, body }).catch(() => false)
  if (!isValid) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 403 })
  }

  const payload = JSON.parse(body) as JobPayload
  const correlationId = generateCorrelationId()

  const [lead] = await db.select().from(leads).where(eq(leads.id, payload.leadId))
  if (!lead) return NextResponse.json({ outcome: 'lead_not_found' })

  // --- Mock registration code (Phase 2 timeout) ---
  if (payload.action === 'trigger_code') {
    const result = await triggerRegistrationCode(lead.id)
    if (result.ok) {
      await transitionLead(lead.id, 'waiting_for_code', 'code_triggered', correlationId)

      if (ONBOARDING_VIDEO) {
        await sendVideo(lead, ONBOARDING_VIDEO, `🎬 Código mock: ${result.code}`)
      }

      await sendInlineKeyboard(
        lead,
        `✅ Tu código de registro (mock) es: ${result.code}\n\n` +
          `Cuando hayas “activado” la app con ese código, confirma aquí:`,
        [
          [{ text: '✅ Ya me registré', callback_data: REGISTER_CALLBACK_YES }],
          [{ text: '❌ No pude registrarme', callback_data: REGISTER_CALLBACK_NO }],
        ],
      )
    } else {
      await transitionLead(lead.id, 'code_delivered_not_registered', 'code_trigger_failed', correlationId)
    }
    return NextResponse.json({ outcome: result.ok ? 'code_sent' : 'code_failed', code: result.code })
  }

  // --- Registration inactivity freeze (20h) ---
  if (payload.action === 'freeze_registration') {
    if (lead.leadStatus === 'waiting_for_code') {
      await transitionLead(lead.id, 'code_delivered_no_response', 'inactivity_freeze', correlationId)
    }
    return NextResponse.json({ outcome: 'freeze_applied' })
  }

  // --- Re-engagement notifications ---
  if (payload.action === 're-engage') {
    const lastActivity = new Date(lead.lastActivityAt).getTime()
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000
    if (lastActivity > fiveMinutesAgo) {
      return NextResponse.json({ outcome: 'skipped_already_active' })
    }

    const attempt = payload.attemptNumber as 1 | 2 | 3
    const message = getReEngagementMessage(attempt)
    await sendText(lead, message)

    await db
      .update(reEngagementSchedules)
      .set({ deliveredAt: new Date(), outcome: 'no_response' })
      .where(eq(reEngagementSchedules.leadId, lead.id))

    await db
      .update(leads)
      .set({ reEngagementCount: lead.reEngagementCount + 1, updatedAt: new Date() })
      .where(eq(leads.id, lead.id))

    if (attempt >= MAX_REENGAGEMENT_ATTEMPTS) {
      await transitionLead(lead.id, 'abandono', 're_engagement_exhausted', correlationId)
      return NextResponse.json({ outcome: 'marked_abandono' })
    }

    const nextAttempt = (attempt + 1) as 2 | 3
    const cadenceOverride = process.env.RE_ENGAGEMENT_CADENCE_OVERRIDE_SECONDS
    const delays = cadenceOverride ? cadenceOverride.split(',').map(Number) : null
    const delay = delays ? delays[nextAttempt - 1] : REENGAGEMENT_DELAY_SECONDS[nextAttempt]
    await scheduleJob(lead.id, payload.phase, nextAttempt, delay, 're-engage')

    return NextResponse.json({ outcome: 'sent' })
  }

  return NextResponse.json({ outcome: 'unknown_action' })
}
