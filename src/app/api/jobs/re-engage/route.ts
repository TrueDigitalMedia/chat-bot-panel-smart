import { NextRequest, NextResponse } from 'next/server'
import { Receiver } from '@upstash/qstash'
import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { leads, surveyProfiles, reEngagementSchedules } from '@/lib/db/schema'
import { transitionLead } from '@/lib/state-machine'
import { buildRegistrationCodeRequest } from '@/lib/tdm-registration/build-request'
import { requestRegistrationCode } from '@/lib/tdm-registration/client'
import { deliverRegistrationCode } from '@/lib/onboarding/deliver-registration-code'
import { logCall } from '@/lib/db/call-log'
import { IOS_APP_LINK, ANDROID_APP_LINK } from '@/lib/conversation/exit-messages'
import { sendText } from '@/lib/messaging/send'
import { scheduleJob } from '@/lib/scheduler/re-engagement'
import {
  REENGAGEMENT_DELAY_SECONDS,
  MAX_REENGAGEMENT_ATTEMPTS,
  MAX_LINK_SENT_REMINDER_ATTEMPTS,
  LINK_SENT_REMINDER_ATTEMPT_BASE,
  REGISTRATION_CODE_TIMEOUT_ATTEMPT_NUMBER,
  linkSentReminderDelaySeconds,
} from '@/lib/scheduler/constants'
import { getReEngagementMessage } from '@/lib/scheduler/messages'
import { generateCorrelationId } from '@/lib/correlation'
import { env, isTdmRegistrationRequestConfigured } from '@/lib/env'
import type { JobPayload } from '@/lib/scheduler/re-engagement'
import type { SurveyProfile } from '@/types/lead'

const receiver = new Receiver({
  currentSigningKey: env.QSTASH_CURRENT_SIGNING_KEY,
  nextSigningKey: env.QSTASH_NEXT_SIGNING_KEY,
})

/** Deterministic per-lead placeholder — only used while REGISTRATION_CODE_MOCK_ENABLED=true. */
function mockRegistrationCode(leadId: string): string {
  return `MOCK-${leadId.replace(/-/g, '').slice(0, 8).toUpperCase()}`
}

/**
 * Stamps the matching re_engagement_schedules row so it's visible from the DB (admin/
 * SQL) whether a given job actually reached this handler — without this, a QStash
 * callback that never lands (e.g. APP_BASE_URL pointing at a dead tunnel) is
 * indistinguishable in our own data from "still scheduled, hasn't fired yet".
 */
async function markScheduleDelivered(
  leadId: string,
  phase: number,
  attemptNumber: number,
  outcome: string,
): Promise<void> {
  await db
    .update(reEngagementSchedules)
    .set({ deliveredAt: new Date(), outcome })
    .where(
      and(
        eq(reEngagementSchedules.leadId, leadId),
        eq(reEngagementSchedules.phase, phase),
        eq(reEngagementSchedules.attemptNumber, attemptNumber),
      ),
    )
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = await request.text()
  const signature = request.headers.get('Upstash-Signature') ?? ''
  const isValid = await receiver.verify({ signature, body }).catch(() => false)
  if (!isValid) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 403 })
  }

  const payload = JSON.parse(body) as JobPayload
  const correlationId = generateCorrelationId()

  // First line of defense for "is QStash even reaching us" — this appears in the
  // server's own stdout the instant a callback lands, before any DB/business logic.
  console.info('[jobs/re-engage] received', {
    action: payload.action,
    leadId: payload.leadId,
    phase: payload.phase,
    attemptNumber: payload.attemptNumber,
    correlationId,
  })

  const [lead] = await db.select().from(leads).where(eq(leads.id, payload.leadId))
  if (!lead) return NextResponse.json({ outcome: 'lead_not_found' })

  // Stamp deliveredAt as soon as we know QStash's callback actually reached this
  // handler for this specific (leadId, phase, attemptNumber) — before any branch-
  // specific outcome is decided. Without this, a job that's scheduled but whose
  // callback never lands (e.g. APP_BASE_URL pointing at a dead tunnel) looks
  // identical in re_engagement_schedules to one that just hasn't fired yet.
  await markScheduleDelivered(payload.leadId, payload.phase, payload.attemptNumber, 'received')

  // --- Registration code request (client-mysql-integration.md §2b) ---
  // We POST a JSON asking TDM for the code; TDM calls back
  // POST /api/webhooks/tdm-registration-code with it (or a failure). This job only
  // sends the request and arms a timeout — it never delivers the code itself, unlike
  // the mock path. REGISTRATION_CODE_MOCK_ENABLED=true bypasses TDM entirely (their
  // endpoint isn't live yet) and delivers a mock code immediately.
  if (payload.action === 'request_registration_code') {
    if (lead.leadStatus !== 'link_sent') {
      return NextResponse.json({ outcome: 'skipped_not_link_sent' })
    }

    if (env.REGISTRATION_CODE_MOCK_ENABLED) {
      const code = mockRegistrationCode(lead.id)
      await deliverRegistrationCode(lead, code, { reason: 'code_triggered_mock', phase: payload.phase, mock: true }, correlationId)
      return NextResponse.json({ outcome: 'code_sent', code, mock: true })
    }

    if (!isTdmRegistrationRequestConfigured()) {
      // TDM hasn't handed over their endpoint yet — nothing to request, no point
      // waiting out a timeout that can only fail (mirrors the old MySQL-sync-disabled check).
      await transitionLead(lead.id, 'abandono', 'code_request_not_configured', correlationId)
      return NextResponse.json({ outcome: 'not_configured' })
    }

    const [profile] = await db.select().from(surveyProfiles).where(eq(surveyProfiles.leadId, lead.id)).limit(1)
    if (!profile) {
      await transitionLead(lead.id, 'abandono', 'code_request_missing_profile', correlationId)
      return NextResponse.json({ outcome: 'missing_profile' })
    }

    const requestPayload = buildRegistrationCodeRequest(lead, profile as SurveyProfile)
    const start = Date.now()
    try {
      await requestRegistrationCode(requestPayload)
      await db
        .update(leads)
        .set({ tdmRegistrationRequestedAt: new Date(), updatedAt: new Date() })
        .where(eq(leads.id, lead.id))
      await logCall({
        leadId: lead.id,
        callType: 'tdm_registration_request',
        latencyMs: Date.now() - start,
        correlationId,
      })
    } catch (err) {
      await logCall({
        leadId: lead.id,
        callType: 'tdm_registration_request',
        latencyMs: Date.now() - start,
        correlationId,
        error: String(err),
      }).catch(() => {})
      // Fall through — still arm the timeout below rather than giving up immediately;
      // QStash retries this job on failure per its own policy before it stops trying.
    }

    await scheduleJob(
      lead.id,
      payload.phase,
      REGISTRATION_CODE_TIMEOUT_ATTEMPT_NUMBER,
      env.TDM_REGISTRATION_CODE_TIMEOUT_SECONDS,
      'registration_code_timeout',
    )
    return NextResponse.json({ outcome: 'request_sent' })
  }

  // --- Registration code timeout — TDM's webhook never called back within the window ---
  if (payload.action === 'registration_code_timeout') {
    if (lead.leadStatus !== 'link_sent') {
      return NextResponse.json({ outcome: 'skipped_already_progressed' })
    }
    // From `link_sent` the only valid next statuses are `waiting_for_code`/`abandono`
    // (transitions.ts); `code_delivered_not_registered` is reserved for "a code WAS
    // delivered and the user declined/failed" (registration-choice.ts), which doesn't
    // apply here since no code was ever sent — `abandono` is the correct give-up state.
    await transitionLead(lead.id, 'abandono', 'tdm_registration_request_timeout', correlationId)
    return NextResponse.json({ outcome: 'code_request_timeout' })
  }

  // --- Link-sent reminder (2h, up to MAX_LINK_SENT_REMINDER_ATTEMPTS) — re-asks if the
  // lead never moved past link_sent, then reschedules itself until the max is hit ---
  if (payload.action === 'link_sent_reminder') {
    if (lead.leadStatus === 'link_sent') {
      const attempt = payload.attemptNumber - LINK_SENT_REMINDER_ATTEMPT_BASE
      await sendText(
        lead,
        `¿Ya descargaste la app? Cuando la tengas, te enviaremos tu código de registro.\n\n` +
          `📱 iOS: ${IOS_APP_LINK}\n🤖 Android: ${ANDROID_APP_LINK}`,
      )
      if (attempt >= MAX_LINK_SENT_REMINDER_ATTEMPTS) {
        await transitionLead(lead.id, 'abandono', 'link_sent_reminder_exhausted', correlationId)
        return NextResponse.json({ outcome: 'reminder_sent_marked_abandono' })
      }
      await scheduleJob(
        lead.id,
        payload.phase,
        LINK_SENT_REMINDER_ATTEMPT_BASE + attempt + 1,
        linkSentReminderDelaySeconds(),
        'link_sent_reminder',
      )
      return NextResponse.json({ outcome: 'reminder_sent' })
    }
    return NextResponse.json({ outcome: 'skipped_not_link_sent' })
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
