import type { LeadStatus } from '@/types/lead'

// Allowed state transitions. Key = current status, value = set of valid next statuses.
const ALLOWED_TRANSITIONS: Record<LeadStatus, Set<LeadStatus>> = {
  incomplete: new Set(['link_sent', 'not_qualified', 'quota_exhausted', 'abandono']),
  not_qualified: new Set([]),
  quota_exhausted: new Set([]),
  link_sent: new Set(['waiting_for_code', 'abandono']),
  waiting_for_code: new Set([
    'code_delivered_registered',
    'code_delivered_not_registered',
    'code_delivered_no_response',
    'abandono',
  ]),
  code_delivered_registered: new Set(['ficha_hogar_completada', 'ficha_hogar_descartado', 'abandono']),
  code_delivered_not_registered: new Set(['abandono']),
  // Not a dead end: this only means the freeze timer fired before the user replied
  // (routinely 20h, but as little as RE_ENGAGEMENT_TIMEOUT_OVERRIDE_SECONDS in tests) —
  // a late "Ya me registré"/"No pude registrarme" tap should still be honored instead
  // of silently discarded, so the same targets as waiting_for_code stay reachable.
  code_delivered_no_response: new Set(['code_delivered_registered', 'code_delivered_not_registered']),
  ficha_hogar_completada: new Set([]),
  ficha_hogar_descartado: new Set([]),
  abandono: new Set([]),
}

export function validateTransition(from: LeadStatus, to: LeadStatus): boolean {
  return ALLOWED_TRANSITIONS[from]?.has(to) ?? false
}

export function isTerminal(status: LeadStatus): boolean {
  return ALLOWED_TRANSITIONS[status].size === 0
}
