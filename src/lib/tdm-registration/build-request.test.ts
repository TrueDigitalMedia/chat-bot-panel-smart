import { describe, it, expect } from 'vitest'
import { buildRegistrationCodeRequest } from './build-request'
import type { Lead, SurveyProfile } from '@/types/lead'

function baseLead(overrides: Partial<Lead> = {}): Lead {
  return {
    id: 'lead-1',
    channel: 'whatsapp',
    channelUserId: '50212345678',
    channelUsername: null,
    phoneNumber: '+50212345678',
    leadStatus: 'link_sent',
    currentPhase: 2,
    surveyQuestionIndex: 19,
    quotaSegment: 'Nivel 2',
    quotaMatchedDimension: 'nse',
    quotaMatchedValue: 'Nivel 2',
    score: 42,
    optInAccepted: true,
    d1Accepted: true,
    d2Accepted: true,
    d3IsShopper: true,
    conversationSummary: null,
    reEngagementCount: 0,
    lastActivityAt: new Date('2026-07-20T10:00:00Z'),
    createdAt: new Date('2026-07-20T09:00:00Z'),
    updatedAt: new Date('2026-07-20T10:00:00Z'),
    tdmRegistrationRequestedAt: null,
    tdmRegistrationCode: null,
    panelSmartSyncStatus: null,
    panelSmartLastSyncAt: null,
    panelSmartSyncedAnswersJson: null,
    ...overrides,
  }
}

function baseProfile(overrides: Partial<SurveyProfile> = {}): SurveyProfile {
  return {
    id: 'profile-1',
    leadId: 'lead-1',
    fullName: 'Juan Pérez',
    country: 'Guatemala',
    stateProvince: 'Guatemala',
    municipality: 'Mixco',
    neighborhood: 'Zona 10',
    nseRegion: 'Centro II',
    email: 'juan@example.com',
    gender: 'Masculino',
    educationPsh: 'Universidad Completa',
    cars: '2 o más',
    domesticHelp: false,
    householdSize: 3,
    bedrooms: 3,
    shoppingFrequency: 'Semanal',
    shoppingCategories: [1, 2],
    contactChannel: 'WhatsApp',
    contactSchedule: 'Noche (18-21hs)',
    rawFreeTextJson: null,
    extractionModel: null,
    completedAt: new Date('2026-07-20T10:00:00Z'),
    age: 33,
    isPregnant: false,
    hasBabyUnder3: false,
    ...overrides,
  }
}

describe('buildRegistrationCodeRequest', () => {
  it('maps every field from lead + profile, per the agreed JSON shape', () => {
    const payload = buildRegistrationCodeRequest(baseLead(), baseProfile())
    expect(payload).toEqual({
      lead_id: 'lead-1',
      canal: 'WhatsApp',
      pais_codigo: 'GT',
      pais_residencia: 'Guatemala',
      nombre_completo: 'Juan Pérez',
      telefono: '+50212345678',
      correo_electronico: 'juan@example.com',
      region: 'Centro II',
      departamento_provincia: 'Guatemala',
      municipio_canton: 'Mixco',
      barrio_parroquia: 'Zona 10',
      metodo_contacto_preferido: 'WhatsApp',
      horario_contacto_preferido: 'Noche (18-21hs)',
      fecha_nacimiento: null,
    })
  })

  it('always sends fecha_nacimiento: null, even if unrelated fields are missing', () => {
    const payload = buildRegistrationCodeRequest(
      baseLead({ phoneNumber: null }),
      baseProfile({ email: null, nseRegion: null }),
    )
    expect(payload.fecha_nacimiento).toBeNull()
    expect(payload.telefono).toBeNull()
    expect(payload.correo_electronico).toBeNull()
    expect(payload.region).toBeNull()
  })

  it('reflects the actual channel (telegram/web) in canal, Title Case per TDM convention', () => {
    expect(buildRegistrationCodeRequest(baseLead({ channel: 'telegram' }), baseProfile()).canal).toBe(
      'Telegram',
    )
    expect(buildRegistrationCodeRequest(baseLead({ channel: 'web' }), baseProfile()).canal).toBe('Web')
  })

  it('sets pais_codigo: null for an unrecognized country without throwing', () => {
    const payload = buildRegistrationCodeRequest(baseLead(), baseProfile({ country: 'México' }))
    expect(payload.pais_codigo).toBeNull()
    expect(payload.pais_residencia).toBe('México')
  })
})
