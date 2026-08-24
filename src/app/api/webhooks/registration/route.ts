import { NextRequest, NextResponse } from 'next/server'
import { transitionLead } from '@/lib/state-machine'
import { isTerminal, NEVER_REENGAGE_STATUSES } from '@/lib/state-machine/transitions'
import { generateCorrelationId } from '@/lib/correlation'
import { getLeadById } from '@/lib/db/leads'
import { handlePhase3Success, handlePhase3Failure } from '@/lib/conversation/phases/phase-3'

interface RegistrationWebhookPayload {
  lead_id: string
  event: 'registration_success' | 'registration_failure'
  mock_user_id?: string
  timestamp?: string
}

/**
 * Local/mock registration status webhook.
 * Simulate success:
 *   curl -X POST "$APP_BASE_URL/api/webhooks/registration" \
 *     -H "X-Registration-Secret: $REGISTRATION_WEBHOOK_SECRET" \
 *     -H "Content-Type: application/json" \
 *     -d '{"lead_id":"<uuid>","event":"registration_success"}'
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const expected = process.env.REGISTRATION_WEBHOOK_SECRET ?? 'dev-registration-secret'
  const secret = request.headers.get('X-Registration-Secret')
  if (!secret || secret !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const body = (await request.json()) as RegistrationWebhookPayload
  const correlationId = generateCorrelationId()

  const lead = await getLeadById(body.lead_id)
  if (!lead) {
    return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
  }

  // Explicit defense-in-depth: today this is also implicitly enforced by transitionLead
  // rejecting the transition once a lead is abandono/code_delivered_not_registered, but
  // that's a side effect of the FSM graph rather than an intentional opt-out guard — make
  // it explicit so a future loosening of ALLOWED_TRANSITIONS can't silently reopen this.
  if (isTerminal(lead.leadStatus) || NEVER_REENGAGE_STATUSES.has(lead.leadStatus)) {
    return NextResponse.json({ ok: true, skipped: 'lead_opted_out_or_terminal' })
  }

  if (body.event === 'registration_success') {
    await transitionLead(lead.id, 'code_delivered_registered', 'registration_mock_webhook', correlationId)
    await handlePhase3Success(lead, correlationId)
  } else {
    await transitionLead(lead.id, 'code_delivered_not_registered', 'registration_mock_webhook_failure', correlationId)
    await handlePhase3Failure(lead)
  }

  return NextResponse.json({ ok: true, mock: true })
}
