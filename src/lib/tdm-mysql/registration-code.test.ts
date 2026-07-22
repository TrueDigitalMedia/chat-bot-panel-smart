import { describe, it, expect, vi, beforeEach } from 'vitest'

const { poolExecute } = vi.hoisted(() => ({ poolExecute: vi.fn() }))
vi.mock('./client', () => ({
  getClientMysqlPool: () => ({ execute: poolExecute }),
}))

import { fetchRegistrationCode } from './registration-code'

describe('fetchRegistrationCode', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('returns the trimmed code when TDM has written one', async () => {
    poolExecute.mockResolvedValue([[{ registration_code: '  PAN-12345  ' }]])

    const code = await fetchRegistrationCode(42)

    expect(code).toBe('PAN-12345')
    const [sql, values] = poolExecute.mock.calls[0]
    expect(sql).toMatch(/^SELECT registration_code FROM tb_leads_agente_ia WHERE id = \?/)
    expect(values).toEqual([42])
  })

  it('returns null when the column is still empty (not yet written by TDM)', async () => {
    poolExecute.mockResolvedValue([[{ registration_code: null }]])

    expect(await fetchRegistrationCode(42)).toBeNull()
  })

  it('returns null when the column is an empty/whitespace string', async () => {
    poolExecute.mockResolvedValue([[{ registration_code: '   ' }]])

    expect(await fetchRegistrationCode(42)).toBeNull()
  })

  it('returns null when no row exists for this tdmLeadId', async () => {
    poolExecute.mockResolvedValue([[]])

    expect(await fetchRegistrationCode(999)).toBeNull()
  })
})
