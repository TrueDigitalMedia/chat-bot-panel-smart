import { NextRequest, NextResponse } from 'next/server'
import { Receiver } from '@upstash/qstash'
import { and, eq, isNull, lt } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { leads, reEngagementSchedules } from '@/lib/db/schema'
import { transitionLead } from '@/lib/state-machine'
import { isTerminal, NEVER_REENGAGE_STATUSES } from '@/lib/state-machine/transitions'
import { requestRegistrationCodeForLead } from '@/lib/onboarding/request-registration-code'
import { sendTemplateOrKeyboard } from '@/lib/messaging/send'
import { REENGAGE_CALLBACK_CONTINUE, REENGAGE_CALLBACK_STOP } from '@/lib/conversation/reengage-choice'
import { scheduleJob } from '@/lib/scheduler/re-engagement'
import {
  MAX_REENGAGEMENT_ATTEMPTS,
  reengagementDelaySeconds,
  RE_ENGAGEMENT_TIMEOUT_ATTEMPT_NUMBER,
  RE_ENGAGEMENT_FINAL_TIMEOUT_SECONDS,
  REENGAGE_OUTBOUND_CEILING,
} from '@/lib/scheduler/constants'
import { getNextMessageVariant, resolveMessagePool } from '@/lib/scheduler/messages'
import { countOutboundSinceLastInbound } from '@/lib/db/conversation-messages'
import { reengageTemplateLogicalId } from '@/lib/whatsapp/providers/twilio/template-ids'
import { generateCorrelationId } from '@/lib/correlation'
import { env } from '@/lib/env'
import type { JobPayload } from '@/lib/scheduler/re-engagement'
import type { LeadStatus } from '@/types/lead'

const receiver = new Receiver({
  currentSigningKey: env.QSTASH_CURRENT_SIGNING_KEY,
  nextSigningKey: env.QSTASH_NEXT_SIGNING_KEY,
})

/**
 * Atomically claims this (leadId, phase, attemptNumber) delivery by flipping outcome
 * from NULL to 'received' in a single conditional UPDATE. QStash only guarantees
 * at-least-once delivery — the same callback can land twice (slow handler response,
 * a 5xx from a mid-handler throw, a network blip after we already responded 200) —
 * so without this guard a retried delivery re-runs the whole handler, including
 * sendText, and produces a duplicate WhatsApp message. Returns false when the row
 * was already claimed by an earlier delivery (or doesn't exist), meaning this
 * delivery must not act.
 */
async function claimSchedule(
  leadId: string,
  phase: number,
  attemptNumber: number,
): Promise<boolean> {
  const claimed = await db
    .update(reEngagementSchedules)
    .set({ deliveredAt: new Date(), outcome: 'received' })
    .where(
      and(
        eq(reEngagementSchedules.leadId, leadId),
        eq(reEngagementSchedules.phase, phase),
        eq(reEngagementSchedules.attemptNumber, attemptNumber),
        isNull(reEngagementSchedules.outcome),
      ),
    )
    .returning({ id: reEngagementSchedules.id })

  return claimed.length > 0
}

/**
 * Finalizes the outcome of the ONE schedule row this delivery owns. Every write here
 * must stay scoped to (leadId, phase, attemptNumber) — a bare `eq(leadId)` filter
 * overwrites deliveredAt/outcome on every other schedule row for the lead, including
 * jobs that haven't fired yet (outcome still NULL), which then get silently dropped
 * by claimSchedule as "already delivered" and corrupts the per-attempt audit trail
 * the 24h-window compliance check relies on.
 */
async function finalizeSchedule(
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

/**
 * Global spaced-burst guard, hoisted out of the 're-engage' branch so it also covers
 * request_registration_code / registration_code_timeout / freeze_registration: if this
 * lead has already been sent REENGAGE_OUTBOUND_CEILING outbound messages without a single
 * reply (across every subsystem), stop the cascade instead of adding another message.
 * Finalizes this delivery's own schedule row and marks the lead terminal —
 * transitionLead cancels every other pending job on the way into a terminal /
 * NEVER_REENGAGE status, so the rest of the cascade unwinds on its own. Returns true when
 * it acted (caller must stop). No-op for a lead already terminal or in a NEVER_REENGAGE
 * status — those have no valid transition to abandono and their own guards handle them.
 */
async function stopForOutboundCeiling(
  lead: typeof leads.$inferSelect,
  payload: JobPayload,
  correlationId: string,
): Promise<boolean> {
  const status = lead.leadStatus as LeadStatus
  if (isTerminal(status) || NEVER_REENGAGE_STATUSES.has(status)) return false
  const outboundStreak = await countOutboundSinceLastInbound(lead.id)
  if (outboundStreak < REENGAGE_OUTBOUND_CEILING) return false
  await finalizeSchedule(lead.id, payload.phase, payload.attemptNumber, 'skipped_outbound_ceiling')
  const to: LeadStatus = status === 'waiting_for_code' ? 'code_delivered_no_response' : 'abandono'
  await transitionLead(lead.id, to, 'outbound_ceiling_reached', correlationId)
  return true
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

  // Claim this specific delivery before doing anything else. Also doubles as the
  // "did QStash's callback reach us" stamp (deliveredAt) that admin/SQL relies on to
  // distinguish "scheduled but never fired" from "fired" — a job that's scheduled but
  // whose callback never lands (e.g. APP_BASE_URL pointing at a dead tunnel) previously
  // looked identical in re_engagement_schedules to one that just hasn't fired yet.
  const claimed = await claimSchedule(payload.leadId, payload.phase, payload.attemptNumber)
  if (!claimed) {
    console.info('[jobs/re-engage] duplicate delivery skipped', {
      action: payload.action,
      leadId: payload.leadId,
      phase: payload.phase,
      attemptNumber: payload.attemptNumber,
      correlationId,
    })
    return NextResponse.json({ outcome: 'skipped_duplicate_delivery' })
  }

  // Spaced-burst guard for every action (see stopForOutboundCeiling) — checked before the
  // per-action logic so a lead buried in unanswered outbound also short-circuits the
  // code-request / timeout / freeze actions, not just re-engagement nudges.
  if (await stopForOutboundCeiling(lead, payload, correlationId)) {
    return NextResponse.json({ outcome: 'skipped_outbound_ceiling' })
  }

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

    const outcome = await requestRegistrationCodeForLead(lead, payload.phase, correlationId)
    return NextResponse.json({ outcome })
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

  // --- Registration inactivity freeze (20h) ---
  if (payload.action === 'freeze_registration') {
    if (lead.leadStatus === 'waiting_for_code') {
      await transitionLead(lead.id, 'code_delivered_no_response', 'inactivity_freeze', correlationId)
    }
    return NextResponse.json({ outcome: 'freeze_applied' })
  }

  // --- Re-engagement timeout — the final (3rd) nudge's Continue/Stop buttons went
  // unanswered long enough that we give up. Only abandons if the lead genuinely never
  // responded: isTerminal already covers an explicit "No, gracias" tap (handled
  // synchronously in reengage-choice.ts, which sets a different, more specific status
  // reason), and comparing lastActivityAt against when the final nudge was delivered
  // covers "Sí, quiero continuar" (upsertLead bumps lastActivityAt on every inbound
  // message, before routing) — either way, something happened since, so this backs off.
  if (payload.action === 're_engagement_timeout') {
    if (isTerminal(lead.leadStatus as LeadStatus)) {
      return NextResponse.json({ outcome: 'already_terminal' })
    }
    const [finalNudge] = await db
      .select({ deliveredAt: reEngagementSchedules.deliveredAt })
      .from(reEngagementSchedules)
      .where(
        and(
          eq(reEngagementSchedules.leadId, lead.id),
          eq(reEngagementSchedules.phase, payload.phase),
          eq(reEngagementSchedules.attemptNumber, MAX_REENGAGEMENT_ATTEMPTS),
        ),
      )
    const respondedSince =
      finalNudge?.deliveredAt && lead.lastActivityAt && lead.lastActivityAt > finalNudge.deliveredAt
    if (respondedSince) {
      return NextResponse.json({ outcome: 'skipped_already_responded' })
    }
    await transitionLead(lead.id, 'abandono', 're_engagement_exhausted', correlationId)
    return NextResponse.json({ outcome: 'marked_abandono' })
  }

  // --- Re-engagement notifications (unified recontact — covers phase 1, phase 2's
  // "download the app" nudge, and phase 4's Ficha Hogar nudge, all through the same
  // consent+idle-gated cadence; message content is picked by resolveMessagePool from
  // the lead's *current* status, not the phase the job happened to be filed under) ---
  if (payload.action === 're-engage') {
    // The lead may have completed/abandoned/moved to a terminal status since this job
    // was scheduled (e.g. it self-resolved through a different channel) — every other
    // action in this file already self-guards on status; this one previously didn't.
    if (isTerminal(lead.leadStatus as LeadStatus)) {
      await finalizeSchedule(lead.id, payload.phase, payload.attemptNumber, 'skipped_terminal')
      return NextResponse.json({ outcome: 'skipped_terminal' })
    }

    if (NEVER_REENGAGE_STATUSES.has(lead.leadStatus as LeadStatus)) {
      await finalizeSchedule(lead.id, payload.phase, payload.attemptNumber, 'skipped_declined')
      return NextResponse.json({ outcome: 'skipped_declined' })
    }

    // Check if lead has consented to re-engagement contact
    if (lead.reEngagementConsentAccepted !== true) {
      await finalizeSchedule(lead.id, payload.phase, payload.attemptNumber, 'skipped_no_consent')
      return NextResponse.json({ outcome: 'skipped_no_consent' })
    }

    const lastActivity = new Date(lead.lastActivityAt).getTime()
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000
    if (lastActivity > fiveMinutesAgo) {
      return NextResponse.json({ outcome: 'skipped_already_active' })
    }

    // WhatsApp's customer-service window only allows free-form (non-template) messages
    // within 24h of the user's last inbound message. This codebase never sends Meta
    // template messages, so a send past the window would be a policy violation with no
    // fallback — the 75min/7h/12h cadence (scheduler/constants.ts) is designed to stay
    // under 24h, but nothing enforced that at send time if a job ran late. A 1h safety
    // margin covers scheduling jitter/retries without cutting the real cadence short.
    const hoursSinceActivity = (Date.now() - lastActivity) / (60 * 60 * 1000)
    if (hoursSinceActivity >= 23) {
      await finalizeSchedule(lead.id, payload.phase, payload.attemptNumber, 'skipped_24h_window')
      return NextResponse.json({ outcome: 'skipped_24h_window' })
    }

    // (The global spaced-burst ceiling — countOutboundSinceLastInbound >=
    // REENGAGE_OUTBOUND_CEILING — is enforced for every action up front by
    // stopForOutboundCeiling, before this branch runs.)

    // Defensive cap: attemptNumber in the payload is already bounded 1..3, but a
    // stuck/looping counter (historically inflated by the unscoped schedule updates
    // fixed above, or an undetected duplicate delivery) must never keep sending. If the
    // lead has already had its full quota of nudges, stop the cadence rather than pile on.
    if (lead.reEngagementCount >= MAX_REENGAGEMENT_ATTEMPTS) {
      await finalizeSchedule(lead.id, payload.phase, payload.attemptNumber, 'skipped_attempts_exhausted')
      return NextResponse.json({ outcome: 'skipped_attempts_exhausted' })
    }

    const attempt = payload.attemptNumber as 1 | 2 | 3
    const pool = resolveMessagePool(lead.leadStatus as LeadStatus)
    const { text: message, variantOrder } = await getNextMessageVariant(lead.id, attempt, pool)
    // Every nudge offers an explicit way out instead of just repeating the ask, so a
    // genuinely uninterested lead can opt out (`re_engagement_declined_{1st,2nd,3rd}_attempt`
    // — see reengage-choice.ts) rather than only being able to decline on attempt 2 or
    // silently riding out to attempt 3's `re_engagement_exhausted`.
    await sendTemplateOrKeyboard(
      lead,
      reengageTemplateLogicalId(pool, attempt, variantOrder),
      message,
      [
        [
          { text: '✅ Sí, quiero continuar', callback_data: REENGAGE_CALLBACK_CONTINUE },
          { text: '❌ No, gracias', callback_data: REENGAGE_CALLBACK_STOP },
        ],
      ],
    )

    await finalizeSchedule(lead.id, payload.phase, payload.attemptNumber, 'no_response')

    // Conditional increment: the WHERE clause is a second line of defense against a
    // runaway counter — if a concurrent delivery already pushed it to the ceiling, this
    // update is a no-op instead of overshooting MAX_REENGAGEMENT_ATTEMPTS.
    await db
      .update(leads)
      .set({ reEngagementCount: lead.reEngagementCount + 1, updatedAt: new Date() })
      .where(and(eq(leads.id, lead.id), lt(leads.reEngagementCount, MAX_REENGAGEMENT_ATTEMPTS)))

    if (attempt >= MAX_REENGAGEMENT_ATTEMPTS) {
      // Don't abandon synchronously here — the message we just sent carries its own
      // Continue/Stop buttons, and marking the lead abandono in this same request means
      // any tap on either button (routed through handleReengageChoice's isTerminal
      // check) would already be too late, landing on the generic "can't continue"
      // message no matter what the user chose. Give them a real window to respond
      // instead; re_engagement_timeout below only abandons if they still haven't by then.
      await scheduleJob(
        lead.id,
        lead.currentPhase,
        RE_ENGAGEMENT_TIMEOUT_ATTEMPT_NUMBER,
        RE_ENGAGEMENT_FINAL_TIMEOUT_SECONDS,
        're_engagement_timeout',
      )
      return NextResponse.json({ outcome: 'sent_final_awaiting_response' })
    }

    const nextAttempt = (attempt + 1) as 2 | 3
    // lead.currentPhase (freshly fetched above), not payload.phase — the lead may have
    // advanced phases between when this job was scheduled and when it fires.
    await scheduleJob(lead.id, lead.currentPhase, nextAttempt, reengagementDelaySeconds(nextAttempt), 're-engage')

    return NextResponse.json({ outcome: 'sent' })
  }

  return NextResponse.json({ outcome: 'unknown_action' })
}
