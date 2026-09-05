import { describe, it, expect, vi, beforeEach } from 'vitest'

const { dbMock, isPanelSmartSyncEnabled, syncToPanelSmart } = vi.hoisted(() => ({
  dbMock: { select: vi.fn(), update: vi.fn(), insert: vi.fn() },
  isPanelSmartSyncEnabled: vi.fn(),
  syncToPanelSmart: vi.fn(),
}))
vi.mock('@/lib/db/client', () => ({ db: dbMock }))
vi.mock('@/lib/db/call-log', () => ({ logCall: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/env', () => ({ isPanelSmartSyncEnabled: () => isPanelSmartSyncEnabled() }))
vi.mock('./client', () => ({ syncToPanelSmart: (...args: unknown[]) => syncToPanelSmart(...args) }))

import { syncPendingPanelSmartAnswers, previewPanelSmartSync } from './sync'
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

/** Chainable fake matching `db.update(X).set(Y).where(Z)` → resolves to `undefined`, capturing `set`. */
function updateChain(captured: Record<string, unknown>[]) {
  return {
    set: (values: Record<string, unknown>) => {
      captured.push(values)
      return { where: () => Promise.resolve(undefined) }
    },
  }
}

/** Chainable fake matching `db.insert(X).values(Y)` (awaited directly) and
 *  `db.insert(X).values(Y).returning(Z)` (used by createPanelSmartSyncRun for its id). */
function insertChain(returningRows: Array<Record<string, unknown>> = [{ id: 'run-1' }]) {
  return {
    values: () => Object.assign(Promise.resolve(undefined), { returning: () => Promise.resolve(returningRows) }),
  }
}

const LEAD_ROW = {
  id: 'lead-1',
  panelSmartSyncStatus: null,
  panelSmartLastSyncAt: null,
  panelSmartSyncedAnswersJson: null,
  createdAt: new Date('2026-01-15T10:00:00.000Z'),
  lastActivityAt: new Date('2026-01-16T09:30:00.000Z'),
}

const PROFILE_ROW = {
  id: 'profile-1',
  leadId: 'lead-1',
  fullName: 'Ana López',
  cars: '2 o más',
  shoppingCategories: null,
  email: null,
}

describe('syncPendingPanelSmartAnswers', () => {
  let updateSets: Record<string, unknown>[]

  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(logCall).mockResolvedValue(undefined)
    updateSets = []
    dbMock.update.mockImplementation(() => updateChain(updateSets))
    dbMock.insert.mockImplementation(() => insertChain())
  })

  it('no-ops and returns true immediately when disabled, without touching the db', async () => {
    isPanelSmartSyncEnabled.mockReturnValue(false)

    const result = await syncPendingPanelSmartAnswers('lead-1', 'corr-1', { trigger: 'state_transition' })

    expect(result).toBe(true)
    expect(dbMock.select).not.toHaveBeenCalled()
    expect(syncToPanelSmart).not.toHaveBeenCalled()
  })

  it('no-ops when every filled field already matches the last-synced snapshot', async () => {
    isPanelSmartSyncEnabled.mockReturnValue(true)
    dbMock.select
      .mockReturnValueOnce(selectChain([{ ...LEAD_ROW, panelSmartSyncedAnswersJson: { fullName: 'Ana López', cars: '2 o más' } }]))
      .mockReturnValueOnce(selectChain([PROFILE_ROW]))
      .mockReturnValueOnce(selectChain([]))

    const result = await syncPendingPanelSmartAnswers('lead-1', 'corr-1', { trigger: 'state_transition' })

    expect(result).toBe(true)
    expect(syncToPanelSmart).not.toHaveBeenCalled()
  })

  it('sends only new/changed fields, then merges them into the snapshot on success', async () => {
    isPanelSmartSyncEnabled.mockReturnValue(true)
    dbMock.select
      .mockReturnValueOnce(selectChain([{ ...LEAD_ROW, panelSmartSyncedAnswersJson: { fullName: 'Ana López' } }]))
      .mockReturnValueOnce(selectChain([PROFILE_ROW]))
      .mockReturnValueOnce(selectChain([]))
    syncToPanelSmart.mockResolvedValue(undefined)

    const result = await syncPendingPanelSmartAnswers('lead-1', 'corr-1', { trigger: 'state_transition' })

    expect(result).toBe(true)
    const sent = syncToPanelSmart.mock.calls[0][0] as {
      lead_id: string
      responses: Array<{ codigo_pregunta: string; respuesta: unknown }>
    }
    expect(sent.lead_id).toBe('lead-1')
    expect(sent.responses).toContainEqual({ codigo_pregunta: 'cars', pregunta: expect.any(String), respuesta: '2 o más' })
    // The changed survey field is the only *diffed* answer sent; the always-on metadata
    // rows (lead_status, ficha_hogar_completada, fecha_primer_mensaje,
    // fecha_ultimo_mensaje) ride along.
    expect(sent.responses.map((r) => r.codigo_pregunta)).not.toContain('fullName')
    expect(updateSets[0]).toMatchObject({
      panelSmartSyncStatus: 'synced',
      panelSmartSyncedAnswersJson: { fullName: 'Ana López', cars: '2 o más' },
    })
    expect(logCall).toHaveBeenCalledWith(
      expect.objectContaining({ leadId: 'lead-1', callType: 'panel_smart_sync', correlationId: 'corr-1' }),
    )
  })

  it('leaves the snapshot untouched and marks failed when the outbound call throws', async () => {
    isPanelSmartSyncEnabled.mockReturnValue(true)
    dbMock.select
      .mockReturnValueOnce(selectChain([LEAD_ROW]))
      .mockReturnValueOnce(selectChain([PROFILE_ROW]))
      .mockReturnValueOnce(selectChain([]))
    syncToPanelSmart.mockRejectedValue(new Error('Panel Smart sync failed: 500 boom'))

    const result = await syncPendingPanelSmartAnswers('lead-1', 'corr-1', { trigger: 'state_transition' })

    expect(result).toBe(false)
    expect(updateSets[0]).toMatchObject({ panelSmartSyncStatus: 'failed' })
    expect(updateSets[0].panelSmartSyncedAnswersJson).toBeUndefined()
    expect(logCall).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringContaining('Panel Smart sync failed') }),
    )
  })

  it('returns false without throwing when the lead is not found', async () => {
    isPanelSmartSyncEnabled.mockReturnValue(true)
    dbMock.select.mockReturnValueOnce(selectChain([]))

    const result = await syncPendingPanelSmartAnswers('missing-lead', 'corr-1', { trigger: 'state_transition' })

    expect(result).toBe(false)
    expect(syncToPanelSmart).not.toHaveBeenCalled()
  })

  it('force: true resends every filled field even when the snapshot already matches, and logs the payload', async () => {
    isPanelSmartSyncEnabled.mockReturnValue(true)
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    dbMock.select
      .mockReturnValueOnce(
        selectChain([
          {
            ...LEAD_ROW,
            leadStatus: 'incomplete',
            panelSmartSyncedAnswersJson: { fullName: 'Ana López', cars: '2 o más' },
          },
        ]),
      )
      .mockReturnValueOnce(selectChain([PROFILE_ROW]))
      .mockReturnValueOnce(selectChain([]))
    syncToPanelSmart.mockResolvedValue(undefined)

    const result = await syncPendingPanelSmartAnswers('lead-1', 'corr-1', { trigger: 'manual', force: true })

    expect(result).toBe(true)
    const sentPayload = syncToPanelSmart.mock.calls[0][0] as {
      lead_id: string
      responses: Array<{ codigo_pregunta: string; respuesta: unknown }>
    }
    // Both fields already matched the synced snapshot — a non-forced sync would have
    // sent neither (see the "no-ops when every filled field already matches" test above).
    expect(sentPayload.responses).toEqual(
      expect.arrayContaining([
        { codigo_pregunta: 'fullName', pregunta: expect.any(String), respuesta: 'Ana López' },
        { codigo_pregunta: 'cars', pregunta: expect.any(String), respuesta: '2 o más' },
      ]),
    )

    const loggedCall = consoleLogSpy.mock.calls.find((args) => String(args[0]).includes('panel_smart_sync_payload'))
    expect(loggedCall).toBeDefined()
    const logged = JSON.parse(loggedCall![0] as string)
    expect(logged).toMatchObject({
      event: 'panel_smart_sync_payload',
      lead_id: 'lead-1',
      correlation_id: 'corr-1',
      trigger: 'manual',
      force: true,
    })
    expect(logged.payload).toEqual(sentPayload)

    consoleLogSpy.mockRestore()
  })
})

describe('previewPanelSmartSync', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('force: true previews every filled field even when the snapshot already matches', async () => {
    isPanelSmartSyncEnabled.mockReturnValue(true)
    dbMock.select
      .mockReturnValueOnce(
        selectChain([
          {
            ...LEAD_ROW,
            leadStatus: 'incomplete',
            panelSmartSyncedAnswersJson: { fullName: 'Ana López', cars: '2 o más' },
          },
        ]),
      )
      .mockReturnValueOnce(selectChain([PROFILE_ROW]))
      .mockReturnValueOnce(selectChain([]))

    const preview = await previewPanelSmartSync('lead-1', { force: true })

    expect(preview.status).toBe('ok')
    expect(preview.fieldNames).toEqual(expect.arrayContaining(['fullName', 'cars']))
  })

  it('without force, an already-synced lead has nothing pending', async () => {
    isPanelSmartSyncEnabled.mockReturnValue(true)
    dbMock.select
      .mockReturnValueOnce(
        selectChain([
          { ...LEAD_ROW, panelSmartSyncedAnswersJson: { fullName: 'Ana López', cars: '2 o más' } },
        ]),
      )
      .mockReturnValueOnce(selectChain([PROFILE_ROW]))
      .mockReturnValueOnce(selectChain([]))

    const preview = await previewPanelSmartSync('lead-1')

    expect(preview.status).toBe('nothing_pending')
  })

  it('includes nse_region in the synced answers when the GPS lookup found a catalog match', async () => {
    isPanelSmartSyncEnabled.mockReturnValue(true)
    dbMock.select
      .mockReturnValueOnce(selectChain([{ ...LEAD_ROW, panelSmartSyncedAnswersJson: { fullName: 'Ana López', cars: '2 o más' } }]))
      .mockReturnValueOnce(selectChain([{ ...PROFILE_ROW, nseRegion: 'NSE-3' }]))
      .mockReturnValueOnce(selectChain([]))

    const preview = await previewPanelSmartSync('lead-1', { force: true })

    expect(preview.payload?.responses).toContainEqual({
      codigo_pregunta: 'nse_region',
      pregunta: 'Región NSE',
      respuesta: 'NSE-3',
    })
  })

  it('includes the phone number in the synced answers when the lead has one', async () => {
    isPanelSmartSyncEnabled.mockReturnValue(true)
    dbMock.select
      .mockReturnValueOnce(selectChain([{ ...LEAD_ROW, phoneNumber: '+50378889999', panelSmartSyncedAnswersJson: { fullName: 'Ana López', cars: '2 o más' } }]))
      .mockReturnValueOnce(selectChain([PROFILE_ROW]))
      .mockReturnValueOnce(selectChain([]))

    const preview = await previewPanelSmartSync('lead-1', { force: true })

    expect(preview.payload?.responses).toContainEqual({
      codigo_pregunta: 'telefono',
      pregunta: 'Número de Teléfono',
      respuesta: '+50378889999',
    })
  })

  it('includes the first- and last-message dates (leads.createdAt / lastActivityAt) as ISO timestamps', async () => {
    isPanelSmartSyncEnabled.mockReturnValue(true)
    dbMock.select
      .mockReturnValueOnce(selectChain([{
        ...LEAD_ROW,
        createdAt: new Date('2026-02-03T14:25:00.000Z'),
        lastActivityAt: new Date('2026-02-09T18:40:00.000Z'),
        panelSmartSyncedAnswersJson: { fullName: 'Ana López', cars: '2 o más' },
      }]))
      .mockReturnValueOnce(selectChain([PROFILE_ROW]))
      .mockReturnValueOnce(selectChain([]))

    const preview = await previewPanelSmartSync('lead-1', { force: true })

    expect(preview.payload?.responses).toContainEqual({
      codigo_pregunta: 'fecha_primer_mensaje',
      pregunta: 'Fecha del Primer Mensaje',
      respuesta: '2026-02-03T14:25:00.000Z',
    })
    expect(preview.payload?.responses).toContainEqual({
      codigo_pregunta: 'fecha_ultimo_mensaje',
      pregunta: 'Fecha del Último Mensaje',
      respuesta: '2026-02-09T18:40:00.000Z',
    })
  })

  it('omits the phone number when the lead has none', async () => {
    isPanelSmartSyncEnabled.mockReturnValue(true)
    dbMock.select
      .mockReturnValueOnce(selectChain([{ ...LEAD_ROW, phoneNumber: null, panelSmartSyncedAnswersJson: { fullName: 'Ana López', cars: '2 o más' } }]))
      .mockReturnValueOnce(selectChain([PROFILE_ROW]))
      .mockReturnValueOnce(selectChain([]))

    const preview = await previewPanelSmartSync('lead-1', { force: true })

    expect(preview.payload?.responses.some((r) => r.codigo_pregunta === 'telefono')).toBe(false)
  })

  it('omits nse_region when the GPS lookup had no catalog match (an "allowlist miss", nseRegion stays null)', async () => {
    isPanelSmartSyncEnabled.mockReturnValue(true)
    dbMock.select
      .mockReturnValueOnce(selectChain([{ ...LEAD_ROW, panelSmartSyncedAnswersJson: { fullName: 'Ana López', cars: '2 o más' } }]))
      .mockReturnValueOnce(selectChain([{ ...PROFILE_ROW, nseRegion: null }]))
      .mockReturnValueOnce(selectChain([]))

    const preview = await previewPanelSmartSync('lead-1', { force: true })

    expect(preview.payload?.responses.some((r) => r.codigo_pregunta === 'nse_region')).toBe(false)
  })

  // Spec 014 T038 — an Ecuador lead's NSE point total (survey_profiles.nse_points) must
  // reach TDM; `score`/`quota_segment` alone aren't enough since Ecuador leads never get
  // a `leads.score` (that column stays the SCL-CAM point scale — see phase-1.ts).
  it('includes nse_points in the synced answers for an Ecuador lead', async () => {
    isPanelSmartSyncEnabled.mockReturnValue(true)
    dbMock.select
      .mockReturnValueOnce(
        selectChain([
          {
            ...LEAD_ROW,
            score: null,
            quotaSegment: 'C',
            panelSmartSyncedAnswersJson: { fullName: 'Ana López', country: 'Ecuador' },
          },
        ]),
      )
      .mockReturnValueOnce(selectChain([{ ...PROFILE_ROW, country: 'Ecuador', nseRegion: 'Cuenca', nsePoints: 58 }]))
      .mockReturnValueOnce(selectChain([]))

    const preview = await previewPanelSmartSync('lead-1', { force: true })

    expect(preview.payload?.responses).toContainEqual({
      codigo_pregunta: 'nse_points',
      pregunta: 'Puntaje NSE (Ecuador)',
      respuesta: '58',
    })
    expect(preview.payload?.responses).toContainEqual({
      codigo_pregunta: 'quota_segment',
      pregunta: 'Segmento de Cupo (NSE)',
      respuesta: 'C',
    })
    expect(preview.payload?.responses.some((r) => r.codigo_pregunta === 'score')).toBe(false)
  })

  it('omits nse_points when the lead has no NSE points recorded (e.g. a CAM lead)', async () => {
    isPanelSmartSyncEnabled.mockReturnValue(true)
    dbMock.select
      .mockReturnValueOnce(selectChain([{ ...LEAD_ROW, panelSmartSyncedAnswersJson: { fullName: 'Ana López', cars: '2 o más' } }]))
      .mockReturnValueOnce(selectChain([{ ...PROFILE_ROW, nsePoints: null }]))
      .mockReturnValueOnce(selectChain([]))

    const preview = await previewPanelSmartSync('lead-1', { force: true })

    expect(preview.payload?.responses.some((r) => r.codigo_pregunta === 'nse_points')).toBe(false)
  })
})
