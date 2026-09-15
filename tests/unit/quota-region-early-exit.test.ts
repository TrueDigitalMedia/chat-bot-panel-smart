import { describe, it, expect, vi, beforeEach } from 'vitest'

// `db/client.ts` calls `neon(process.env.POSTGRES_URL!)` at module load — mock it so unit
// tests don't need a real connection string just to import gps-capture.ts's dependency chain.
vi.mock('@/lib/db/client', () => ({
  db: {
    select: () => ({ from: () => ({ where: () => ({ limit: async () => [{}] }) }) }),
    update: () => ({ set: () => ({ where: async () => undefined }) }),
  },
}))
vi.mock('@/lib/env', () => ({ env: {} }))

const { transitionLead, sendText, checkRegionQuota, mockState } = vi.hoisted(() => ({
  transitionLead: vi.fn(async () => undefined),
  sendText: vi.fn(async () => undefined),
  checkRegionQuota: vi.fn(async () => ({ open: true }) as { open: boolean; deniedReason?: string }),
  mockState: { resolvedNseRegion: 'Centro I' as string | null },
}))

vi.mock('@/lib/state-machine', () => ({ transitionLead }))

vi.mock('@/lib/messaging/send', () => ({
  sendText,
  sendInlineKeyboard: vi.fn(async () => undefined),
  sendLocationRequest: vi.fn(async () => undefined),
  confirmLocationKeyboardRemoved: vi.fn(async () => undefined),
}))

vi.mock('@/lib/scoring/quota', () => ({ checkRegionQuota }))

vi.mock('@/lib/countries/registry', () => ({
  getCountryConfig: () => ({ resolveNseRegion: () => mockState.resolvedNseRegion }),
}))

import { applyManualMunicipalityAllowlist } from '@/lib/conversation/gps-capture'
import type { Lead } from '@/types/lead'

const LEAD = { id: 'lead1', channel: 'whatsapp', channelUserId: 'u1' } as unknown as Lead

beforeEach(() => {
  transitionLead.mockClear()
  sendText.mockClear()
  checkRegionQuota.mockClear()
  checkRegionQuota.mockResolvedValue({ open: true })
  mockState.resolvedNseRegion = 'Centro I'
})

describe('applyManualMunicipalityAllowlist — early quota-exhausted exit (PUNTO 1)', () => {
  it('does NOT reject and does not send any exit message when the resolved region still has room', async () => {
    checkRegionQuota.mockResolvedValue({ open: true })
    const result = await applyManualMunicipalityAllowlist(LEAD, {
      country: 'Honduras',
      stateProvince: 'Cortés',
      municipality: 'San Pedro Sula',
      geoSource: 'text_exact',
      correlationId: 'c1',
    })
    expect(result).toEqual({ nseRegion: 'Centro I', rejected: false })
    expect(transitionLead).not.toHaveBeenCalled()
    expect(sendText).not.toHaveBeenCalled()
  })

  it('rejects immediately (quota_exhausted + EXIT_B) when the resolved region is already completa', async () => {
    checkRegionQuota.mockResolvedValue({ open: false, deniedReason: 'region_completa' })
    const result = await applyManualMunicipalityAllowlist(LEAD, {
      country: 'Panamá',
      stateProvince: 'Panamá',
      municipality: 'Panamá',
      geoSource: 'text_exact',
      correlationId: 'c2',
    })
    expect(result.rejected).toBe(true)
    expect(transitionLead).toHaveBeenCalledWith('lead1', 'quota_exhausted', 'region_closed_early_exit', 'c2')
    expect(sendText).toHaveBeenCalledTimes(2)
  })

  it('rejects immediately when the region is out of the client sample (region_fuera_de_muestra)', async () => {
    checkRegionQuota.mockResolvedValue({ open: false, deniedReason: 'region_fuera_de_muestra' })
    const result = await applyManualMunicipalityAllowlist(LEAD, {
      country: 'El Salvador',
      stateProvince: 'San Salvador',
      municipality: 'San Salvador',
      geoSource: 'text_exact',
      correlationId: 'c3',
    })
    expect(result.rejected).toBe(true)
    expect(transitionLead).toHaveBeenCalledTimes(1)
  })

  it('does NOT reject when the municipality does not resolve to any region yet (Ecuador Quito/Guayaquil pending parroquia)', async () => {
    mockState.resolvedNseRegion = null
    const result = await applyManualMunicipalityAllowlist(LEAD, {
      country: 'Ecuador',
      stateProvince: 'Pichincha',
      municipality: 'Distrito Metropolitano de Quito',
      geoSource: 'text_exact',
      correlationId: 'c4',
    })
    expect(result).toEqual({ nseRegion: null, rejected: false })
    // checkRegionQuota must never even be consulted for a null region here — the survey
    // has to keep going until neighborhood/parroquia resolves it, or survey-end decides.
    expect(checkRegionQuota).not.toHaveBeenCalled()
    expect(transitionLead).not.toHaveBeenCalled()
    expect(sendText).not.toHaveBeenCalled()
  })
})
