import { describe, it, expect } from 'vitest'
import { validateTransition, isTerminal } from '@/lib/state-machine/transitions'
import type { LeadStatus } from '@/types/lead'

describe('state machine transitions', () => {
  it('allows incomplete → link_sent', () => {
    expect(validateTransition('incomplete', 'link_sent')).toBe(true)
  })

  it('allows incomplete → not_qualified', () => {
    expect(validateTransition('incomplete', 'not_qualified')).toBe(true)
  })

  it('blocks not_qualified → link_sent (terminal)', () => {
    expect(validateTransition('not_qualified', 'link_sent')).toBe(false)
  })

  it('allows link_sent → waiting_for_code', () => {
    expect(validateTransition('link_sent', 'waiting_for_code')).toBe(true)
  })

  it('allows waiting_for_code → code_delivered_registered', () => {
    expect(validateTransition('waiting_for_code', 'code_delivered_registered')).toBe(true)
  })

  it('allows any active status → abandono', () => {
    const statuses: LeadStatus[] = ['incomplete', 'link_sent', 'waiting_for_code']
    statuses.forEach((s) => expect(validateTransition(s, 'abandono')).toBe(true))
  })

  it('marks terminal statuses correctly', () => {
    const terminals: LeadStatus[] = [
      'not_qualified',
      'quota_exhausted',
      'code_delivered_no_response',
      'ficha_hogar_completada',
      'abandono',
    ]
    terminals.forEach((s) => expect(isTerminal(s)).toBe(true))
  })

  it('non-terminal statuses are not terminal', () => {
    const active: LeadStatus[] = ['incomplete', 'link_sent', 'waiting_for_code']
    active.forEach((s) => expect(isTerminal(s)).toBe(false))
  })
})
