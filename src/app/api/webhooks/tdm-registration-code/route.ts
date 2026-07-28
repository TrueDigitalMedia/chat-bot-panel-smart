import { NextRequest, NextResponse } from 'next/server'
import { getLeadById } from '@/lib/db/leads'
import { generateCorrelationId } from '@/lib/correlation'
import { deliverRegistrationCode } from '@/lib/onboarding/deliver-registration-code'
import { env } from '@/lib/env'

interface TdmRegistrationCodeWebhookPayload {
  lead_id: string
  panelist_id: number
}

/**
 * TDM calls this once they've generated a panelist ID for a lead, in response to the
 * JSON request we POST via requestRegistrationCode() (src/lib/tdm-registration/client.ts,
 * triggered from jobs/re-engage.ts's `request_registration_code` action). Replaces the old
 * MySQL-poll mechanism — see
 * specs/001-panelsmart-recruitment-bot/contracts/client-mysql-integration.md §2b.
 *
 * TDM only calls this on success — there's no failure event in their payload. A lead that
 * never gets called back here times out via the `registration_code_timeout` job
 * (jobs/re-engage.ts, TDM_REGISTRATION_CODE_TIMEOUT_SECONDS) and is marked `abandono`.
 *
 * Simulate:
 *   curl -X POST "$APP_BASE_URL/api/webhooks/tdm-registration-code" \
 *     -H "X-TDM-Registration-Secret: $TDM_REGISTRATION_WEBHOOK_SECRET" \
 *     -H "Content-Type: application/json" \
 *     -d '{"lead_id":"<uuid>","panelist_id":22222}'
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  // Logged before auth/shape validation, on purpose: while confirming TDM's real header
  // name/casing and payload shape for the first time, a request that fails our checks is
  // exactly the one we most need to see in full (not just the ones that already match our
  // assumptions). Remove once the real integration is confirmed stable, if desired.
  const rawBody = await request.text()
  console.info('[webhooks/tdm-registration-code] request received', {
    timestamp: new Date().toISOString(),
    headers: Object.fromEntries(request.headers.entries()),
    body: rawBody,
  })

  const secret = request.headers.get('X-TDM-Registration-Secret')
  if (!secret || secret !== env.TDM_REGISTRATION_WEBHOOK_SECRET) {
    console.warn('[webhooks/tdm-registration-code] unauthorized', {
      expectedHeader: 'X-TDM-Registration-Secret',
      receivedSecretPresent: Boolean(secret),
    })
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 403 })
  }

  let body: TdmRegistrationCodeWebhookPayload
  try {
    body = JSON.parse(rawBody) as TdmRegistrationCodeWebhookPayload
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_payload' }, { status: 400 })
  }

  if (!body.lead_id || typeof body.panelist_id !== 'number') {
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

  await deliverRegistrationCode(
    lead,
    String(body.panelist_id),
    { reason: 'code_triggered_tdm_webhook', phase: lead.currentPhase },
    correlationId,
  )
  return NextResponse.json({ ok: true, outcome: 'code_delivered' })
}
