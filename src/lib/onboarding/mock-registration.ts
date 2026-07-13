import { logCall } from '@/lib/db/call-log'
import { generateCorrelationId } from '@/lib/correlation'

export interface MockRegistrationResult {
  ok: boolean
  code: string
}

/**
 * Mock-only registration code delivery.
 * No external PanelSmart (or other) HTTP calls.
 */
export async function triggerRegistrationCode(
  leadId: string,
): Promise<MockRegistrationResult> {
  const correlationId = generateCorrelationId()
  const start = Date.now()
  const code = `MOCK-${leadId.replace(/-/g, '').slice(0, 8).toUpperCase()}`

  await logCall({
    leadId,
    callType: 'registration_code_mock',
    latencyMs: Date.now() - start,
    correlationId,
  }).catch(() => {})

  console.info(`[onboarding:mock] registration code for lead ${leadId}: ${code}`)
  return { ok: true, code }
}
