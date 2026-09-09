import type { Lead } from '@/types/lead'

/**
 * A gate callback (optin/d1/reengagement_consent/d3) for a gate this lead already
 * cleared — the user scrolled up and tapped an old button, or a late/duplicate tap
 * landed. None of these gates is ever revisited, so it is unambiguously stale. Without
 * this, the tap falls through to the current step's handler, which answers
 * "no te entendí" + re-asks the CURRENT question — reading as "you got this wrong".
 * ~120/month of the parse-failure messages in the 2026-09 audit were exactly this.
 *
 * Survey button callbacks are deliberately NOT covered: the correction flow legitimately
 * revisits earlier survey questions, so a `gender:` tap past that index can be real.
 */
export function isStalePassedGateCallback(lead: Lead, callbackData: string): boolean {
  switch (callbackData.split(':')[0]) {
    case 'optin':
      return lead.optInAccepted === true
    case 'd1':
      return lead.d1Accepted === true
    case 'reengagement_consent':
      return lead.reEngagementConsentAccepted !== null
    case 'd3':
      return lead.d3IsShopper !== null
    default:
      return false
  }
}
