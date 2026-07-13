import { NextRequest, NextResponse } from 'next/server'
import { transitionLead } from '@/lib/state-machine'
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

  if (body.event === 'registration_success') {
    await transitionLead(lead.id, 'code_delivered_registered', 'registration_mock_webhook', correlationId)
    await handlePhase3Success(lead, correlationId)
  } else {
    await transitionLead(lead.id, 'code_delivered_not_registered', 'registration_mock_webhook_failure', correlationId)
    await handlePhase3Failure(lead)
  }

  return NextResponse.json({ ok: true, mock: true })
}
