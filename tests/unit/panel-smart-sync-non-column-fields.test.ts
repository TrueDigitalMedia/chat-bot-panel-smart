import { describe, it, expect, vi } from 'vitest'

// `db/client.ts` calls `neon(process.env.POSTGRES_URL!)` at module load — mock it so unit
// tests don't need a real connection string just to import sync.ts's dependency chain.
vi.mock('@/lib/db/client', () => ({ db: {} }))
vi.mock('@/lib/env', () => ({ isPanelSmartSyncEnabled: () => true }))

import { computePendingFields } from '@/lib/panel-smart/sync'
import type { SurveyProfile, FichaHogarProfile } from '@/types/lead'

function surveyProfile(overrides: Partial<SurveyProfile> = {}): SurveyProfile {
  return {
    id: 'sp1',
    leadId: 'lead1',
    fullName: null,
    country: null,
    stateProvince: null,
    municipality: null,
    neighborhood: null,
    nseRegion: null,
    email: null,
    gender: null,
    educationPsh: null,
    cars: null,
    domesticHelp: null,
    householdSize: null,
    bedrooms: null,
    shoppingFrequency: null,
    shoppingCategories: null,
    contactChannel: null,
    contactSchedule: null,
    rawFreeTextJson: null,
    extractionModel: null,
    completedAt: null,
    age: null,
    isPregnant: null,
    hasBabyUnder3: null,
    conflictOfInterest: null,
    scoringAnswersJson: null,
    nsePoints: null,
    ...overrides,
  }
}

describe('computePendingFields: Ecuador/México non-column NSE scoring answers', () => {
  it('includes Ecuador scoringAnswersJson fields as pending, not just nsePoints', () => {
    const profile = surveyProfile({
      scoringAnswersJson: {
        healthInsurancePsh: 'IESS',
        monthlyIncome: 'De $701 hasta $1.000',
        dwellingFinishes: 'Otro (acabados de lujo)',
        floorMaterial: 'Ladrillo o cemento',
        vehicleCount: '2',
        occupationPsh: 'Empleados de oficina',
        internetAccess: 'Internet Hogar contratado (cable)',
      },
      nsePoints: 42,
    })

    const pending = computePendingFields(profile, null, null)
    const fields = pending.map((p) => p.field)

    expect(fields).toEqual(
      expect.arrayContaining([
        'healthInsurancePsh',
        'monthlyIncome',
        'dwellingFinishes',
        'floorMaterial',
        'vehicleCount',
        'occupationPsh',
        'internetAccess',
      ]),
    )
    expect(pending.find((p) => p.field === 'monthlyIncome')?.value).toBe('De $701 hasta $1.000')
  })

  it('includes México scoringAnswersJson fields as pending', () => {
    const profile = surveyProfile({
      scoringAnswersJson: {
        educationHoh: 'Licenciatura completa',
        fullBathrooms: '2 o más',
        vehicleCount: '1',
        homeInternet: 'Sí tiene',
        workers14Plus: '1',
      },
    })

    const pending = computePendingFields(profile, null, null)
    const fields = pending.map((p) => p.field)

    expect(fields).toEqual(
      expect.arrayContaining(['educationHoh', 'fullBathrooms', 'vehicleCount', 'homeInternet', 'workers14Plus']),
    )
  })

  it('does not re-send a scoring field already present with the same value in the last-synced snapshot', () => {
    const profile = surveyProfile({ scoringAnswersJson: { monthlyIncome: 'Hasta $400' } })
    const pending = computePendingFields(profile, null, { monthlyIncome: 'Hasta $400' })
    expect(pending.find((p) => p.field === 'monthlyIncome')).toBeUndefined()
  })

  it('re-sends a scoring field when its value changed since the last-synced snapshot', () => {
    const profile = surveyProfile({ scoringAnswersJson: { monthlyIncome: 'Más de $3.000' } })
    const pending = computePendingFields(profile, null, { monthlyIncome: 'Hasta $400' })
    expect(pending.find((p) => p.field === 'monthlyIncome')?.value).toBe('Más de $3.000')
  })

  it('skips scoring fields with no value yet', () => {
    const profile = surveyProfile({ scoringAnswersJson: { monthlyIncome: 'Hasta $400' } })
    const pending = computePendingFields(profile, null, null)
    expect(pending.find((p) => p.field === 'floorMaterial')).toBeUndefined()
  })

  it('handles a null scoringAnswersJson without throwing', () => {
    const profile = surveyProfile({ scoringAnswersJson: null })
    expect(() => computePendingFields(profile, null, null)).not.toThrow()
  })

  it('ignores fichaHogar param when null (no crash)', () => {
    const profile = surveyProfile({ scoringAnswersJson: { vehicleCount: '3' } })
    const pending = computePendingFields(profile, null as unknown as FichaHogarProfile | null, null)
    expect(pending.find((p) => p.field === 'vehicleCount')?.value).toBe('3')
  })
})
