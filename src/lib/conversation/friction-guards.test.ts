import { describe, it, expect } from 'vitest'
import { withRetryPrefix, NOT_UNDERSTOOD_PREFIX } from './exit-messages'
import { isStalePassedGateCallback } from './phases/stale-gate'
import type { Lead } from '@/types/lead'

const lead = (over: Partial<Lead> = {}): Lead =>
  ({
    optInAccepted: false,
    d1Accepted: false,
    reEngagementConsentAccepted: null,
    d3IsShopper: null,
    surveyQuestionIndex: 0,
    ...over,
  }) as Lead

describe('withRetryPrefix', () => {
  it('prepends the lead-in only when retry is set', () => {
    expect(withRetryPrefix('¿Cuál es tu edad?', true)).toBe(`${NOT_UNDERSTOOD_PREFIX}\n\n¿Cuál es tu edad?`)
    expect(withRetryPrefix('¿Cuál es tu edad?', false)).toBe('¿Cuál es tu edad?')
    expect(withRetryPrefix('¿Cuál es tu edad?')).toBe('¿Cuál es tu edad?')
  })
})

describe('isStalePassedGateCallback', () => {
  it('flags a gate callback the lead already cleared', () => {
    expect(isStalePassedGateCallback(lead({ optInAccepted: true }), 'optin:accept')).toBe(true)
    expect(isStalePassedGateCallback(lead({ d1Accepted: true }), 'd1:decline')).toBe(true)
    expect(isStalePassedGateCallback(lead({ reEngagementConsentAccepted: false }), 'reengagement_consent:accept')).toBe(true)
    expect(isStalePassedGateCallback(lead({ d3IsShopper: true }), 'd3:yes')).toBe(true)
  })

  it('does NOT flag a live gate the lead is still on', () => {
    expect(isStalePassedGateCallback(lead(), 'optin:accept')).toBe(false)
    expect(isStalePassedGateCallback(lead({ optInAccepted: true }), 'd1:accept')).toBe(false)
    expect(isStalePassedGateCallback(lead({ optInAccepted: true, d1Accepted: true }), 'reengagement_consent:accept')).toBe(false)
  })

  it('never flags survey buttons (correction flow can revisit them)', () => {
    expect(isStalePassedGateCallback(lead({ surveyQuestionIndex: 10 }), 'gender:Femenino')).toBe(false)
    expect(isStalePassedGateCallback(lead({ surveyQuestionIndex: 10 }), 'country:Panamá')).toBe(false)
  })
})
