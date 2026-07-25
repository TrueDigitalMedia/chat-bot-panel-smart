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
      'ficha_hogar_completada',
      'abandono',
    ]
    terminals.forEach((s) => expect(isTerminal(s)).toBe(true))
  })

  it('non-terminal statuses are not terminal', () => {
    const active: LeadStatus[] = ['incomplete', 'link_sent', 'waiting_for_code']
    active.forEach((s) => expect(isTerminal(s)).toBe(false))
  })

  // code_delivered_no_response means the inactivity freeze fired before the user
  // replied — not a dead end: a late "Ya me registré"/"No pude registrarme" tap must
  // still be honored (registration-choice.ts), so it's deliberately not terminal.
  it('allows a late registration reply after the freeze (code_delivered_no_response)', () => {
    expect(isTerminal('code_delivered_no_response')).toBe(false)
    expect(validateTransition('code_delivered_no_response', 'code_delivered_registered')).toBe(true)
    expect(validateTransition('code_delivered_no_response', 'code_delivered_not_registered')).toBe(true)
    expect(validateTransition('code_delivered_no_response', 'incomplete')).toBe(false)
  })
})
