import { scheduleJob } from './re-engagement'
import { REGISTRATION_FREEZE_DELAY_SECONDS, FREEZE_REGISTRATION_ATTEMPT_NUMBER } from './constants'

/**
 * Schedules the 20h inactivity freeze right after the code is delivered (mock or
 * real) — tasks.md T035 documented this but the actual scheduleJob call was never
 * wired up, so a lead that never taps a button just sat in `waiting_for_code` forever.
 * Safe to leave scheduled even if the user confirms early: the handler above checks
 * `leadStatus === 'waiting_for_code'` before acting, so it no-ops once confirmed.
 * Shared between jobs/re-engage.ts (mock code delivery) and the TDM registration-code
 * webhook (real code delivery) — both funnel through deliverRegistrationCode, which
 * calls this.
 */
export async function scheduleFreezeRegistration(leadId: string, phase: number): Promise<void> {
  const delay = Number(process.env.RE_ENGAGEMENT_TIMEOUT_OVERRIDE_SECONDS) || REGISTRATION_FREEZE_DELAY_SECONDS
  await scheduleJob(leadId, phase, FREEZE_REGISTRATION_ATTEMPT_NUMBER, delay, 'freeze_registration').catch((err) => {
    console.error('[scheduler] scheduleJob(freeze_registration) failed', { leadId, err: String(err) })
  })
}
