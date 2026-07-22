import { describe, it, expect, vi, beforeEach } from 'vitest'

// `db/client.ts` calls `neon(process.env.POSTGRES_URL!)` at module load, and `env.ts`
// validates required vars eagerly too — mock both so this unit test doesn't need real
// credentials (same pattern as tests/unit/ficha-hogar-validation.test.ts). The MySQL
// pool is mocked separately at `tdm-mysql/client.ts` so `execute()` is a plain vi.fn().
const { dbMock, isClientMysqlSyncEnabled, poolExecute } = vi.hoisted(() => ({
  dbMock: { select: vi.fn(), update: vi.fn() },
  isClientMysqlSyncEnabled: vi.fn(),
  poolExecute: vi.fn(),
}))
vi.mock('@/lib/db/client', () => ({ db: dbMock }))
vi.mock('@/lib/db/call-log', () => ({ logCall: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/tdm-mysql/client', () => ({
  getClientMysqlPool: () => ({ execute: poolExecute }),
  isClientMysqlSyncEnabled: () => isClientMysqlSyncEnabled(),
}))

vi.mock('@/lib/env', () => ({
  env: { CLIENT_MYSQL_TENANT_ID: undefined, CLIENT_MYSQL_LEAD_VERSION: undefined },
}))

import { syncLead } from './sync'
import { logCall } from '@/lib/db/call-log'

/** Chainable fake matching `db.select().from(X).where(Y).limit(Z)` → resolves to `rows`. */
function selectChain(rows: unknown[]) {
  return {
    from: () => ({
      where: () => ({
        limit: () => Promise.resolve(rows),
      }),
    }),
  }
}

/** Chainable fake matching `db.update(X).set(Y).where(Z)` → resolves to `undefined`. */
function updateChain() {
  return {
    set: () => ({
      where: () => Promise.resolve(undefined),
    }),
  }
}

const LEAD_ROW = {
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
  lastActivityAt: new Date(),
  createdAt: new Date(),
  updatedAt: new Date(),
  tdmLeadId: null,
  tdmSyncStatus: null,
  tdmLastSyncAt: null,
}

const PROFILE_ROW = {
  id: 'profile-1',
  leadId: 'lead-1',
  fullName: 'Ana López',
  country: 'Guatemala',
  stateProvince: 'Guatemala',
  municipality: 'Mixco',
  neighborhood: null,
  nseRegion: 'Sur Occidente Chico',
  email: 'ana@example.com',
  gender: 'Femenino',
  educationPsh: 'Universitaria',
  cars: '1',
  domesticHelp: false,
  householdSize: 4,
  bedrooms: 3,
  shoppingFrequency: 'Semanal',
  shoppingCategories: [1, 3],
  contactChannel: 'WhatsApp',
  contactSchedule: 'Mañana (9-12hs)',
  rawFreeTextJson: null,
  extractionModel: null,
  completedAt: new Date(),
  age: 34,
  isPregnant: false,
  hasBabyUnder3: false,
}

const FICHA_HOGAR_ROW = {
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
  completedAt: new Date(),
  createdAt: new Date(),
}

describe('syncLead', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(logCall).mockResolvedValue(undefined)
  })

  it('no-ops and returns true immediately when sync is disabled, without touching the pool', async () => {
    isClientMysqlSyncEnabled.mockReturnValue(false)

    const result = await syncLead('lead-1', 'corr-1')

    expect(result).toBe(true)
    expect(poolExecute).not.toHaveBeenCalled()
    expect(dbMock.select).not.toHaveBeenCalled()
  })

  it('INSERTs on the first sync (tdmLeadId null), writes tdmLeadId back, and logs success', async () => {
    isClientMysqlSyncEnabled.mockReturnValue(true)
    dbMock.select
      .mockReturnValueOnce(selectChain([LEAD_ROW]))
      .mockReturnValueOnce(selectChain([PROFILE_ROW]))
      .mockReturnValueOnce(selectChain([])) // no ficha_hogar_profiles row yet
    poolExecute.mockResolvedValue([{ insertId: 123 }])
    dbMock.update.mockReturnValue(updateChain())

    const result = await syncLead('lead-1', 'corr-1')

    expect(result).toBe(true)
    expect(poolExecute).toHaveBeenCalledTimes(1)
    const [sql, values] = poolExecute.mock.calls[0]
    expect(sql).toMatch(/^INSERT INTO tb_leads_agente_ia/)
    expect(values).toContain('50212345678')
    expect(dbMock.update).toHaveBeenCalledTimes(1)
    expect(logCall).toHaveBeenCalledWith(
      expect.objectContaining({ leadId: 'lead-1', callType: 'tdm_mysql_sync', correlationId: 'corr-1' }),
    )
    const logCallArgs = vi.mocked(logCall).mock.calls[0][0]
    expect(logCallArgs.error).toBeUndefined()
  })

  it('syncs a disqualified lead just the same — every registration counts (spec 010 amendment)', async () => {
    isClientMysqlSyncEnabled.mockReturnValue(true)
    dbMock.select
      .mockReturnValueOnce(selectChain([{ ...LEAD_ROW, leadStatus: 'not_qualified', tdmLeadId: null }]))
      .mockReturnValueOnce(selectChain([PROFILE_ROW]))
      .mockReturnValueOnce(selectChain([]))
    poolExecute.mockResolvedValue([{ insertId: 124 }])
    dbMock.update.mockReturnValue(updateChain())

    const result = await syncLead('lead-1', 'corr-1')

    expect(result).toBe(true)
    const [sql, values] = poolExecute.mock.calls[0]
    expect(sql).toMatch(/^INSERT INTO tb_leads_agente_ia/)
    expect(values).toContain('not_qualified')
    expect(values).toContain('rejected')
  })

  it('UPDATEs the existing TDM row when tdmLeadId is already set (subsequent phase transitions)', async () => {
    isClientMysqlSyncEnabled.mockReturnValue(true)
    dbMock.select
      .mockReturnValueOnce(selectChain([{ ...LEAD_ROW, tdmLeadId: 42, leadStatus: 'ficha_hogar_completada', conversationSummary: 'resumen del panelista' }]))
      .mockReturnValueOnce(selectChain([PROFILE_ROW]))
      .mockReturnValueOnce(selectChain([FICHA_HOGAR_ROW]))
    dbMock.update.mockReturnValue(updateChain())

    const result = await syncLead('lead-1', 'corr-1')

    expect(result).toBe(true)
    expect(poolExecute).toHaveBeenCalledTimes(1)
    const [sql, values] = poolExecute.mock.calls[0]
    expect(sql).toMatch(/^UPDATE tb_leads_agente_ia SET/)
    expect(sql).toMatch(/WHERE id = \?$/)
    expect(values[values.length - 1]).toBe(42)
    expect(values).toContain('resumen del panelista')
  })

  it('falls back to INSERT and writes the new id back when tdmLeadId is null but Ficha Hogar data already exists', async () => {
    isClientMysqlSyncEnabled.mockReturnValue(true)
    dbMock.select
      .mockReturnValueOnce(selectChain([{ ...LEAD_ROW, tdmLeadId: null, leadStatus: 'ficha_hogar_completada' }]))
      .mockReturnValueOnce(selectChain([PROFILE_ROW]))
      .mockReturnValueOnce(selectChain([FICHA_HOGAR_ROW]))
    poolExecute.mockResolvedValue([{ insertId: 77 }])
    dbMock.update.mockReturnValue(updateChain())

    const result = await syncLead('lead-1', 'corr-1')

    expect(result).toBe(true)
    const [sql] = poolExecute.mock.calls[0]
    expect(sql).toMatch(/^INSERT INTO tb_leads_agente_ia/)
    expect(dbMock.update).toHaveBeenCalledTimes(1)
  })

  it('returns false and logs the error without throwing when the MySQL write fails', async () => {
    isClientMysqlSyncEnabled.mockReturnValue(true)
    dbMock.select
      .mockReturnValueOnce(selectChain([LEAD_ROW]))
      .mockReturnValueOnce(selectChain([PROFILE_ROW]))
      .mockReturnValueOnce(selectChain([]))
    poolExecute.mockRejectedValue(new Error('ETIMEDOUT'))
    dbMock.update.mockReturnValue(updateChain())

    const result = await syncLead('lead-1', 'corr-1')

    expect(result).toBe(false)
    expect(logCall).toHaveBeenCalledWith(
      expect.objectContaining({
        leadId: 'lead-1',
        callType: 'tdm_mysql_sync',
        correlationId: 'corr-1',
        error: expect.stringContaining('ETIMEDOUT'),
      }),
    )
  })

  it('returns false without throwing when the lead is not found', async () => {
    isClientMysqlSyncEnabled.mockReturnValue(true)
    dbMock.select.mockReturnValueOnce(selectChain([]))

    const result = await syncLead('missing-lead', 'corr-1')

    expect(result).toBe(false)
    expect(poolExecute).not.toHaveBeenCalled()
  })
})
