import { describe, it, expect, vi, beforeEach } from 'vitest'

// spec 017 US1 — applyNumberScope pre-sets country + acquisition_source for a brand-new
// conversation on a country-scoped WhatsApp number, and never re-scopes an existing lead.

const { countryForPhoneNumberId, profileSelect, profileUpdate, leadUpdate } = vi.hoisted(() => ({
  countryForPhoneNumberId: vi.fn(),
  profileSelect: vi.fn(),
  profileUpdate: vi.fn(),
  leadUpdate: vi.fn(),
}))

vi.mock('@/lib/whatsapp/number-registry', () => ({ countryForPhoneNumberId }))
vi.mock('@/lib/countries/registry', () => ({
  isSupportedCountry: (c: string) => c === 'Ecuador' || c === 'México',
  getCountryConfig: (c: string) => ({ country: c }),
}))
vi.mock('@/lib/db/client', () => ({
  db: {
    select: () => ({ from: () => ({ where: () => ({ limit: () => profileSelect() }) }) }),
    update: (table: unknown) => ({
      set: (vals: unknown) => ({
        where: () => {
          // crude table discriminator: surveyProfiles update sets { country }, leads sets { acquisitionSource }
          if (vals && typeof vals === 'object' && 'country' in (vals as object)) profileUpdate(vals)
          else leadUpdate(vals)
          return Promise.resolve()
        },
      }),
    }),
  },
}))
vi.mock('@/lib/db/schema', () => ({ leads: {}, surveyProfiles: {} }))

import { applyNumberScope } from '@/lib/whatsapp/number-scope'

beforeEach(() => {
  vi.clearAllMocks()
  profileSelect.mockResolvedValue([{ country: null }])
})

describe('applyNumberScope', () => {
  it('brand-new lead on the Ecuador number → country + acquisition_source set', async () => {
    countryForPhoneNumberId.mockReturnValue('Ecuador')
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})

    const r = await applyNumberScope('lead-1', 'EC_ID', null, 0)

    expect(r).toEqual({ outcome: 'applied', country: 'Ecuador' })
    expect(profileUpdate).toHaveBeenCalledWith({ country: 'Ecuador' })
    expect(leadUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ acquisitionSource: 'whatsapp:number:Ecuador' }),
    )
    expect(info).toHaveBeenCalledWith(expect.stringContaining('whatsapp_number_scope_applied'))
  })

  it('brand-new lead on the México number → México', async () => {
    countryForPhoneNumberId.mockReturnValue('México')
    const r = await applyNumberScope('lead-2', 'MX_ID', null, 0)
    expect(r).toEqual({ outcome: 'applied', country: 'México' })
    expect(leadUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ acquisitionSource: 'whatsapp:number:México' }),
    )
  })

  it('brand-new lead on the generic/CAM number → nothing written', async () => {
    countryForPhoneNumberId.mockReturnValue(null)
    const r = await applyNumberScope('lead-3', 'CAM_ID', null, 0)
    expect(r).toEqual({ outcome: 'generic', country: null })
    expect(profileUpdate).not.toHaveBeenCalled()
    expect(leadUpdate).not.toHaveBeenCalled()
  })

  it('existing lead (message count > 0) is never re-scoped', async () => {
    countryForPhoneNumberId.mockReturnValue('Ecuador')
    const r = await applyNumberScope('lead-4', 'EC_ID', 'CAM_ID', 5)
    expect(r.outcome).toBe('existing_lead_ignored')
    expect(profileUpdate).not.toHaveBeenCalled()
    expect(leadUpdate).not.toHaveBeenCalled()
  })

  it('existing lead with an already-answered country is never re-scoped', async () => {
    countryForPhoneNumberId.mockReturnValue('Ecuador')
    profileSelect.mockResolvedValue([{ country: 'Guatemala' }])
    const r = await applyNumberScope('lead-5', 'EC_ID', 'CAM_ID', 0)
    expect(r.outcome).toBe('existing_lead_ignored')
    expect(profileUpdate).not.toHaveBeenCalled()
  })

  it('existing lead messaging a different number logs whatsapp_inbound_number_mismatch', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})
    profileSelect.mockResolvedValue([{ country: 'Ecuador' }])
    await applyNumberScope('lead-6', 'MX_ID', 'EC_ID', 3)
    expect(info).toHaveBeenCalledWith(expect.stringContaining('whatsapp_inbound_number_mismatch'))
  })

  it('number mapped to an unconfigured country degrades (no write)', async () => {
    countryForPhoneNumberId.mockReturnValue('Brasil')
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const r = await applyNumberScope('lead-7', 'BR_ID', null, 0)
    expect(r.outcome).toBe('degraded')
    expect(profileUpdate).not.toHaveBeenCalled()
  })
})
