import { NextRequest, NextResponse } from 'next/server'
import { Receiver } from '@upstash/qstash'
import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { leads, reEngagementSchedules } from '@/lib/db/schema'
import { transitionLead } from '@/lib/state-machine'
import { fetchRegistrationCode } from '@/lib/tdm-mysql/registration-code'
import { isClientMysqlSyncEnabled } from '@/lib/tdm-mysql/client'
import { logCall } from '@/lib/db/call-log'
import {
  REGISTER_CALLBACK_NO,
  REGISTER_CALLBACK_YES,
} from '@/lib/onboarding/registration-choice'
import { IOS_APP_LINK, ANDROID_APP_LINK } from '@/lib/conversation/exit-messages'
import { sendText, sendVideo, sendInlineKeyboard } from '@/lib/messaging/send'
import { scheduleJob } from '@/lib/scheduler/re-engagement'
import {
  REENGAGEMENT_DELAY_SECONDS,
  MAX_REENGAGEMENT_ATTEMPTS,
  REGISTRATION_CODE_POLL_DELAY_SECONDS,
  MAX_REGISTRATION_CODE_POLL_ATTEMPTS,
  REGISTRATION_FREEZE_DELAY_SECONDS,
  FREEZE_REGISTRATION_ATTEMPT_NUMBER,
} from '@/lib/scheduler/constants'
import { getReEngagementMessage } from '@/lib/scheduler/messages'
import { generateCorrelationId } from '@/lib/correlation'
import { env } from '@/lib/env'
import type { JobPayload } from '@/lib/scheduler/re-engagement'

const ONBOARDING_VIDEO = process.env.ONBOARDING_VIDEO_URL ?? ''

const receiver = new Receiver({
  currentSigningKey: env.QSTASH_CURRENT_SIGNING_KEY,
  nextSigningKey: env.QSTASH_NEXT_SIGNING_KEY,
})

/** Deterministic per-lead placeholder — only used while REGISTRATION_CODE_MOCK_ENABLED=true. */
function mockRegistrationCode(leadId: string): string {
  return `MOCK-${leadId.replace(/-/g, '').slice(0, 8).toUpperCase()}`
}

/**
 * Schedules the 20h inactivity freeze right after the code is delivered (mock or
 * real) — tasks.md T035 documented this but the actual scheduleJob call was never
 * wired up, so a lead that never taps a button just sat in `waiting_for_code` forever.
 * Safe to leave scheduled even if the user confirms early: the handler above checks
 * `leadStatus === 'waiting_for_code'` before acting, so it no-ops once confirmed.
 */
async function scheduleFreezeRegistration(leadId: string, phase: number): Promise<void> {
  const delay = Number(process.env.RE_ENGAGEMENT_TIMEOUT_OVERRIDE_SECONDS) || REGISTRATION_FREEZE_DELAY_SECONDS
  await scheduleJob(leadId, phase, FREEZE_REGISTRATION_ATTEMPT_NUMBER, delay, 'freeze_registration').catch((err) => {
    console.error('[jobs/re-engage] scheduleJob(freeze_registration) failed', { leadId, err: String(err) })
  })
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

  // --- Registration code lookup (client-mysql-integration.md §2) ---
  // TDM's internal process writes `registration_code` into tb_leads_agente_ia on its
  // own schedule once it creates the panelist — the bot never invents this value, it
  // polls for it. First attempt fires PHASE2_CODE_DELAY_SECONDS after link_sent
  // (phase-2.ts); if the column is still empty, this re-schedules itself every
  // REGISTRATION_CODE_POLL_DELAY_SECONDS up to MAX_REGISTRATION_CODE_POLL_ATTEMPTS.
  // REGISTRATION_CODE_MOCK_ENABLED=true bypasses all of that (TDM's write-back side
  // isn't live yet) and delivers a mock code immediately — flip it off once it is.
  if (payload.action === 'trigger_code') {
    if (env.REGISTRATION_CODE_MOCK_ENABLED) {
      // TDM's registration_code write-back isn't live yet — skip the real lookup
      // entirely and deliver a mock code, same shape as the old mock-registration.ts.
      const code = mockRegistrationCode(lead.id)
      await transitionLead(lead.id, 'waiting_for_code', 'code_triggered', correlationId)

      if (ONBOARDING_VIDEO) {
        await sendVideo(lead, ONBOARDING_VIDEO, `🎬 Código mock: ${code}`)
      }

      await sendInlineKeyboard(
        lead,
        `✅ Tu código de registro (mock) es: ${code}\n\n` +
          `Cuando hayas “activado” la app con ese código, confirma aquí:`,
        [
          [{ text: '✅ Ya me registré', callback_data: REGISTER_CALLBACK_YES }],
          [{ text: '❌ No pude registrarme', callback_data: REGISTER_CALLBACK_NO }],
        ],
      )
      await scheduleFreezeRegistration(lead.id, payload.phase)
      return NextResponse.json({ outcome: 'code_sent', code, mock: true })
    }

    if (!isClientMysqlSyncEnabled()) {
      // Deliberately no mock fallback — without a real TDM sync there is no
      // registration_code column to read, so this can never succeed (confirmed
      // tradeoff: local/dev testing of this step requires real TDM MySQL credentials).
      await transitionLead(lead.id, 'abandono', 'code_lookup_sync_disabled', correlationId)
      return NextResponse.json({ outcome: 'sync_disabled' })
    }

    if (lead.tdmLeadId == null) {
      // Sync never actually completed for this lead (write failed or still pending) —
      // nothing to key the lookup on.
      await transitionLead(lead.id, 'abandono', 'code_lookup_no_tdm_id', correlationId)
      return NextResponse.json({ outcome: 'no_tdm_id' })
    }

    const start = Date.now()
    let code: string | null = null
    try {
      code = await fetchRegistrationCode(lead.tdmLeadId)
      await logCall({
        leadId: lead.id,
        callType: 'tdm_mysql_code_lookup',
        latencyMs: Date.now() - start,
        correlationId,
      })
    } catch (err) {
      await logCall({
        leadId: lead.id,
        callType: 'tdm_mysql_code_lookup',
        latencyMs: Date.now() - start,
        correlationId,
        error: String(err),
      }).catch(() => {})
    }

    if (code) {
      await transitionLead(lead.id, 'waiting_for_code', 'code_triggered', correlationId)

      if (ONBOARDING_VIDEO) {
        await sendVideo(lead, ONBOARDING_VIDEO, `🎬 Código: ${code}`)
      }

      await sendInlineKeyboard(
        lead,
        `✅ Tu código de registro es: ${code}\n\n` +
          `Cuando hayas activado la app con ese código, confirma aquí:`,
        [
          [{ text: '✅ Ya me registré', callback_data: REGISTER_CALLBACK_YES }],
          [{ text: '❌ No pude registrarme', callback_data: REGISTER_CALLBACK_NO }],
        ],
      )
      await scheduleFreezeRegistration(lead.id, payload.phase)
      return NextResponse.json({ outcome: 'code_sent', code })
    }

    if (payload.attemptNumber < MAX_REGISTRATION_CODE_POLL_ATTEMPTS) {
      await scheduleJob(
        lead.id,
        payload.phase,
        payload.attemptNumber + 1,
        REGISTRATION_CODE_POLL_DELAY_SECONDS,
        'trigger_code',
      )
      return NextResponse.json({ outcome: 'code_pending_retry_scheduled' })
    }

    // Polling budget exhausted — TDM never wrote a code within the window. From
    // `link_sent` the only valid next statuses are `waiting_for_code`/`abandono`
    // (transitions.ts); `code_delivered_not_registered` is reserved for "a code WAS
    // delivered and the user declined/failed" (registration-choice.ts), which doesn't
    // apply here since no code was ever sent — `abandono` is the correct give-up state.
    await transitionLead(lead.id, 'abandono', 'code_lookup_timeout', correlationId)
    return NextResponse.json({ outcome: 'code_lookup_timeout' })
  }

  // --- Link-sent reminder (2h) — asks once if the lead never moved past link_sent ---
  if (payload.action === 'link_sent_reminder') {
    if (lead.leadStatus === 'link_sent') {
      await sendText(
        lead,
        `¿Ya descargaste la app? Cuando la tengas, te enviaremos tu código de registro.\n\n` +
          `📱 iOS: ${IOS_APP_LINK}\n🤖 Android: ${ANDROID_APP_LINK}`,
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
