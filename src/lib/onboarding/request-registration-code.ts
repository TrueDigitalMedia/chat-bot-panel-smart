import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { leads, surveyProfiles } from '@/lib/db/schema'
import { transitionLead } from '@/lib/state-machine'
import { buildRegistrationCodeRequest } from '@/lib/tdm-registration/build-request'
import { requestRegistrationCode } from '@/lib/tdm-registration/client'
import { applyTdmTestModeOverrides } from '@/lib/tdm-registration/test-mode'
import { deliverRegistrationCode } from './deliver-registration-code'
import { logCall } from '@/lib/db/call-log'
import { scheduleJob } from '@/lib/scheduler/re-engagement'
import { REGISTRATION_CODE_TIMEOUT_ATTEMPT_NUMBER } from '@/lib/scheduler/constants'
import { env, isTdmRegistrationRequestConfigured } from '@/lib/env'
import { sendTemplateOrText } from '@/lib/messaging/send'
import { registrationCodeDelayedRedirect } from '@/lib/conversation/exit-messages'
import { REGISTRATION_CODE_DELAYED_TEMPLATE } from '@/lib/whatsapp/providers/twilio/template-ids'
import type { Lead, SurveyProfile } from '@/types/lead'

/** Deterministic per-lead placeholder — only used while REGISTRATION_CODE_MOCK_ENABLED=true. */
function mockRegistrationCode(leadId: string): string {
  return `MOCK-${leadId.replace(/-/g, '').slice(0, 8).toUpperCase()}`
}

export type RequestRegistrationCodeOutcome = 'code_sent' | 'not_configured' | 'missing_profile' | 'request_sent'

/**
 * Requests (or mocks) the TDM registration code for a lead currently at `link_sent`.
 * Shared by the delayed QStash job (jobs/re-engage/route.ts, fires after
 * PHASE2_CODE_DELAY_SECONDS) and the "ya la descargué" button
 * (onboarding/app-downloaded.ts, fires immediately on user action) — both callers
 * already guard `lead.leadStatus === 'link_sent'` before calling this.
 */
export async function requestRegistrationCodeForLead(
  lead: Lead,
  phase: number,
  correlationId: string,
): Promise<RequestRegistrationCodeOutcome> {
  if (env.REGISTRATION_CODE_MOCK_ENABLED) {
    const code = mockRegistrationCode(lead.id)
    await deliverRegistrationCode(lead, code, { reason: 'code_triggered_mock', phase, mock: true }, correlationId)
    return 'code_sent'
  }

  if (!isTdmRegistrationRequestConfigured()) {
    // TDM hasn't handed over their endpoint yet — nothing to request, no point
    // waiting out a timeout that can only fail (mirrors the old MySQL-sync-disabled check).
    // Tell the user before going terminal — previously this abandoned silently, so the
    // user got no signal and every later message just looped the generic support redirect.
    await sendTemplateOrText(lead, REGISTRATION_CODE_DELAYED_TEMPLATE, registrationCodeDelayedRedirect())
    await transitionLead(lead.id, 'abandono', 'code_request_not_configured', correlationId)
    return 'not_configured'
  }

  const [profile] = await db.select().from(surveyProfiles).where(eq(surveyProfiles.leadId, lead.id)).limit(1)
  if (!profile) {
    await sendTemplateOrText(lead, REGISTRATION_CODE_DELAYED_TEMPLATE, registrationCodeDelayedRedirect())
    await transitionLead(lead.id, 'abandono', 'code_request_missing_profile', correlationId)
    return 'missing_profile'
  }

  let requestPayload = buildRegistrationCodeRequest(lead, profile as SurveyProfile)
  if (env.TDM_TEST_MODE_ENABLED) {
    requestPayload = applyTdmTestModeOverrides(requestPayload)
  }
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
    phase,
    REGISTRATION_CODE_TIMEOUT_ATTEMPT_NUMBER,
    env.TDM_REGISTRATION_CODE_TIMEOUT_SECONDS,
    'registration_code_timeout',
  )
  return 'request_sent'
}
