import { NextRequest, NextResponse } from 'next/server'
import { getLeadById } from '@/lib/db/leads'
import { generateCorrelationId } from '@/lib/correlation'
import { deliverRegistrationCode } from '@/lib/onboarding/deliver-registration-code'
import { transitionLead } from '@/lib/state-machine'
import { env } from '@/lib/env'

interface TdmRegistrationCodeWebhookPayload {
  lead_id: string
  event: 'code_generated' | 'code_generation_failed'
  registration_code?: string | null
  panelist_id?: string | null
  panelist_data?: Record<string, unknown> | null
  error_reason?: string | null
  timestamp?: string
}

/**
 * TDM calls this once they've generated (or failed to generate) a registration code
 * for a lead, in response to the JSON request we POST via requestRegistrationCode()
 * (src/lib/tdm-registration/client.ts, triggered from jobs/re-engage.ts's
 * `request_registration_code` action). Replaces the old MySQL-poll mechanism — see
 * specs/001-panelsmart-recruitment-bot/contracts/client-mysql-integration.md §2b.
 *
 * Simulate success:
 *   curl -X POST "$APP_BASE_URL/api/webhooks/tdm-registration-code" \
 *     -H "X-TDM-Registration-Secret: $TDM_REGISTRATION_WEBHOOK_SECRET" \
 *     -H "Content-Type: application/json" \
 *     -d '{"lead_id":"<uuid>","event":"code_generated","registration_code":"PAN-123456"}'
 *
 * Simulate failure:
 *   curl -X POST "$APP_BASE_URL/api/webhooks/tdm-registration-code" \
 *     -H "X-TDM-Registration-Secret: $TDM_REGISTRATION_WEBHOOK_SECRET" \
 *     -H "Content-Type: application/json" \
 *     -d '{"lead_id":"<uuid>","event":"code_generation_failed","error_reason":"duplicate_phone"}'
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const secret = request.headers.get('X-TDM-Registration-Secret')
  if (!secret || secret !== env.TDM_REGISTRATION_WEBHOOK_SECRET) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 403 })
  }

  let body: TdmRegistrationCodeWebhookPayload
  try {
    body = (await request.json()) as TdmRegistrationCodeWebhookPayload
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_payload' }, { status: 400 })
  }

  if (!body.lead_id || (body.event !== 'code_generated' && body.event !== 'code_generation_failed')) {
    return NextResponse.json({ ok: false, error: 'invalid_payload' }, { status: 400 })
  }
  if (body.event === 'code_generated' && !body.registration_code) {
    return NextResponse.json({ ok: false, error: 'invalid_payload' }, { status: 400 })
  }

  const lead = await getLeadById(body.lead_id)
  if (!lead) {
    return NextResponse.json({ ok: false, error: 'lead_not_found' }, { status: 404 })
  }

  // Idempotency: TDM may retry this webhook. Only act while we're actually still
  // waiting (link_sent) — anything else (code already delivered, already abandoned,
  // or some other status entirely) is a safe no-op, not an error, so returning 200
  // tells TDM's retry logic to stop instead of trying again.
  if (lead.leadStatus !== 'link_sent') {
    return NextResponse.json({ ok: true, outcome: 'already_processed' })
  }

  const correlationId = generateCorrelationId()

  if (body.event === 'code_generation_failed') {
    console.warn('[webhooks/tdm-registration-code] code_generation_failed', {
      leadId: lead.id,
      errorReason: body.error_reason ?? null,
    })
    await transitionLead(lead.id, 'abandono', 'tdm_registration_request_failed', correlationId)
    return NextResponse.json({ ok: true, outcome: 'marked_abandono' })
  }

  await deliverRegistrationCode(
    lead,
    body.registration_code!,
    { reason: 'code_triggered_tdm_webhook', phase: lead.currentPhase },
    correlationId,
  )
  return NextResponse.json({ ok: true, outcome: 'code_delivered' })
}
