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
  code_delivered_no_response: new Set([]),
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
