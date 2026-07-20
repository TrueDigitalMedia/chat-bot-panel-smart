import { describe, it, expect, vi } from 'vitest'

// env.ts validates required vars eagerly at import time; field-map.ts reads
// CLIENT_MYSQL_TENANT_ID/LEAD_VERSION from it — mock so this pure unit test doesn't
// need real credentials, same pattern as tests/unit/ficha-hogar-validation.test.ts.
vi.mock('@/lib/env', () => ({
  env: { CLIENT_MYSQL_TENANT_ID: undefined, CLIENT_MYSQL_LEAD_VERSION: undefined },
}))

import {
  mapCoarseStatus,
  mapShoppingCategories,
  buildPhase1InsertRow,
  buildFichaHogarUpdateRow,
  buildDiscardUpdateRow,
} from './field-map'
import type { FichaHogarProfile, Lead, SurveyProfile } from '@/types/lead'

function baseLead(overrides: Partial<Lead> = {}): Lead {
  return {
    id: 'lead-1',
    channel: 'whatsapp',
    channelUserId: '50212345678',
    channelUsername: null,
    phoneNumber: '50212345678',
    leadStatus: 'link_sent',
    currentPhase: 2,
    surveyQuestionIndex: 17,
    quotaSegment: 'Nivel 2',
    score: 42,
    optInAccepted: true,
    d1Accepted: true,
    d2Accepted: null,
    d3IsShopper: null,
    conversationSummary: null,
    reEngagementCount: 0,
    lastActivityAt: new Date('2026-07-20T10:00:00Z'),
    createdAt: new Date('2026-07-20T09:00:00Z'),
    updatedAt: new Date('2026-07-20T10:00:00Z'),
    tdmLeadId: null,
    tdmSyncStatus: null,
    tdmLastSyncAt: null,
    ...overrides,
  }
}

function baseProfile(overrides: Partial<SurveyProfile> = {}): SurveyProfile {
  return {
    id: 'profile-1',
    leadId: 'lead-1',
    fullName: 'Ana López',
    country: 'Guatemala',
    stateProvince: 'Guatemala',
    municipality: 'Mixco',
    neighborhood: 'Colonia Primavera',
    nseRegion: 'Sur Occidente Chico',
    email: 'ana@example.com',
    gender: 'Femenino',
    educationPsh: 'Universitaria',
    cars: '1',
    domesticHelp: false,
    householdSize: 4,
    bedrooms: 3,
    shoppingFrequency: 'Semanal',
    shoppingCategories: [1, 3, 8],
    contactChannel: 'WhatsApp',
    contactSchedule: 'Mañana (9-12hs)',
    rawFreeTextJson: null,
    extractionModel: null,
    completedAt: new Date('2026-07-20T10:00:00Z'),
    age: 34,
    isPregnant: false,
    hasBabyUnder3: false,
    ...overrides,
  }
}

function baseFichaHogar(overrides: Partial<FichaHogarProfile> = {}): FichaHogarProfile {
  return {
    id: 'fh-1',
    leadId: 'lead-1',
    questionIndex: 7,
    conflictOfInterest: false,
    hasInternet: true,
    relationshipToHoh: 'Yo mismo/a',
    dateOfBirth: '15/06/1990',
    hasHealthCondition: false,
    unlimitedDataPlan: true,
    petCount: 2,
    completedAt: new Date('2026-07-20T11:00:00Z'),
    ...overrides,
  }
}

describe('mapCoarseStatus', () => {
  it('buckets rejected statuses', () => {
    expect(mapCoarseStatus('incomplete')).toBe('rejected')
    expect(mapCoarseStatus('not_qualified')).toBe('rejected')
    expect(mapCoarseStatus('quota_exhausted')).toBe('rejected')
    expect(mapCoarseStatus('ficha_hogar_descartado')).toBe('rejected')
  })

  it('buckets active statuses', () => {
    expect(mapCoarseStatus('link_sent')).toBe('active')
    expect(mapCoarseStatus('waiting_for_code')).toBe('active')
  })

  it('buckets qualified statuses', () => {
    expect(mapCoarseStatus('code_delivered_registered')).toBe('qualified')
    expect(mapCoarseStatus('ficha_hogar_completada')).toBe('qualified')
  })

  it('buckets dropped statuses', () => {
    expect(mapCoarseStatus('code_delivered_not_registered')).toBe('dropped')
    expect(mapCoarseStatus('code_delivered_no_response')).toBe('dropped')
    expect(mapCoarseStatus('abandono')).toBe('dropped')
  })
})

describe('mapShoppingCategories', () => {
  it('joins known ids to their Q14 labels in order', () => {
    expect(mapShoppingCategories([1, 3, 8])).toBe('Canasta básica, Bebidas, Mascotas')
  })

  it('drops unknown ids instead of throwing', () => {
    expect(mapShoppingCategories([1, 99, 2])).toBe('Canasta básica, Lácteos')
  })

  it('returns null for null input', () => {
    expect(mapShoppingCategories(null)).toBeNull()
  })

  it('returns null for empty array input', () => {
    expect(mapShoppingCategories([])).toBeNull()
  })

  it('returns null when every id is unknown', () => {
    expect(mapShoppingCategories([0, 99])).toBeNull()
  })
})

describe('buildPhase1InsertRow', () => {
  it('maps config, lead, and survey profile fields', () => {
    const row = buildPhase1InsertRow(baseLead(), baseProfile())

    expect(row.source).toBe('whatsapp')
    expect(row.status).toBe('active')
    expect(row.lead_status).toBe('link_sent')
    expect(row.f1_lead_status).toBe('link_sent')
    expect(row.phone).toBe('50212345678')
    expect(row.lead_score).toBe(42)
    expect(row.score_category).toBe('Nivel 2')
    expect(row.nombre_completo).toBe('Ana López')
    expect(row.correo_electronico).toBe('ana@example.com')
    expect(row.estado_residencia).toBe('Guatemala')
    expect(row.municipio_residencia).toBe('Mixco')
    expect(row.kantar_region).toBe('Sur Occidente Chico')
    expect(row.categorias_compras_hogar).toBe('Canasta básica, Bebidas, Mascotas')
    expect(row.country).toBe('Guatemala')
    expect(row.pais_residencia).toBe('Guatemala')
    expect(row.personas_hogar).toBe(4)
    expect(row.num_integrantes_hogar).toBe(4)
    expect(row.edad_ama_casa).toBe(34)
    expect(row.embarazo).toBe(false)
  })

  it('falls back parroquia/provincia/canton (and _residencia variants) generically', () => {
    const row = buildPhase1InsertRow(baseLead(), baseProfile())
    expect(row.parroquia_residencia).toBe('Guatemala')
    expect(row.provincia_residencia).toBe('Mixco')
    expect(row.canton_residencia).toBe('Colonia Primavera')
    expect(row.parroquia).toBe('Guatemala')
    expect(row.provincia).toBe('Mixco')
    expect(row.canton).toBe('Colonia Primavera')
  })

  it('leaves thread_summary null and json_raw as the survey profile only', () => {
    const profile = baseProfile()
    const row = buildPhase1InsertRow(baseLead(), profile)
    expect(row.thread_summary).toBeNull()
    expect(JSON.parse(row.json_raw as string)).toMatchObject({ fullName: 'Ana López' })
  })

  it('leaves deliberately-out-of-scope columns undefined', () => {
    const row = buildPhase1InsertRow(baseLead(), baseProfile())
    expect(row.internet_hogar).toBeUndefined()
    expect(row.acceso_internet).toBeUndefined()
    expect(row.parentesco_jefe_familia).toBeUndefined()
    expect(row.fecha_nacimiento_ama_casa).toBeUndefined()
    expect(row.discapacidad_total).toBeUndefined()
    expect(row.plan_datos_ilimitado).toBeUndefined()
    expect(row.num_mascotas).toBeUndefined()
    expect(row._ficha_hogar_completed_at).toBeUndefined()
  })

  it('uses tenant_id/lead_version from env, not invented values', () => {
    const row = buildPhase1InsertRow(baseLead(), baseProfile())
    // Test env has no CLIENT_MYSQL_TENANT_ID/LEAD_VERSION set — must be null, not a guess.
    expect(row.tenant_id).toBeNull()
    expect(row.lead_version).toBeNull()
  })
})

describe('buildFichaHogarUpdateRow', () => {
  it('adds household columns and a non-null thread_summary', () => {
    const row = buildFichaHogarUpdateRow(
      baseLead({ leadStatus: 'ficha_hogar_completada' }),
      baseProfile(),
      baseFichaHogar(),
      'Resumen generado por IA',
    )

    expect(row.status).toBe('qualified')
    expect(row.lead_status).toBe('ficha_hogar_completada')
    expect(row.thread_summary).toBe('Resumen generado por IA')
    expect(row.internet_hogar).toBe(true)
    expect(row.acceso_internet).toBe(true)
    expect(row.parentesco_jefe_familia).toBe('Yo mismo/a')
    expect(row.fecha_nacimiento_ama_casa).toBe('15/06/1990')
    expect(row.discapacidad_total).toBe(false)
    expect(row.plan_datos_ilimitado).toBe(true)
    expect(row.num_mascotas).toBe(2)
    expect(row._ficha_hogar_completed_at).toEqual(new Date('2026-07-20T11:00:00Z'))
  })

  it('never sets f1_lead_status — write-once, owned only by the Phase 1 insert', () => {
    const row = buildFichaHogarUpdateRow(baseLead(), baseProfile(), baseFichaHogar(), null)
    expect(row.f1_lead_status).toBeUndefined()
  })

  it('combines survey + ficha hogar profiles into json_raw', () => {
    const row = buildFichaHogarUpdateRow(baseLead(), baseProfile(), baseFichaHogar(), null)
    const parsed = JSON.parse(row.json_raw as string)
    expect(parsed).toMatchObject({ fullName: 'Ana López', hasInternet: true, petCount: 2 })
  })
})

describe('buildDiscardUpdateRow', () => {
  it('overrides status/lead_status to the discard bucket', () => {
    const row = buildDiscardUpdateRow(baseLead({ leadStatus: 'link_sent' }), baseProfile())
    expect(row.status).toBe('rejected')
    expect(row.lead_status).toBe('ficha_hogar_descartado')
  })

  it('leaves household columns undefined (same base shape as Phase 1, no ficha hogar data)', () => {
    const row = buildDiscardUpdateRow(baseLead(), baseProfile())
    expect(row.internet_hogar).toBeUndefined()
    expect(row.fecha_nacimiento_ama_casa).toBeUndefined()
    expect(row.num_mascotas).toBeUndefined()
    expect(row.f1_lead_status).toBeUndefined()
  })

  it('leaves thread_summary null', () => {
    const row = buildDiscardUpdateRow(baseLead(), baseProfile())
    expect(row.thread_summary).toBeNull()
  })
})
