import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// env.ts validates eagerly — stub it. The registry parses WHATSAPP_NUMBER_MAP at module
// load, so each case sets the map then re-imports the module.
const { envMock } = vi.hoisted(() => ({
  envMock: {} as {
    WHATSAPP_NUMBER_MAP?: string
    WHATSAPP_PHONE_NUMBER_ID?: string
    WHATSAPP_PROVIDER?: string
    TWILIO_WHATSAPP_FROM?: string
  },
}))
vi.mock('@/lib/env', () => ({
  env: envMock,
  isMetaWhatsAppConfigured: () => true,
  isTwilioConfigured: () => true,
}))

const EC_ID = '100000000000001'
const MX_ID = '100000000000002'
const CAM_ID = '100000000000009'

async function loadRegistry(map: string | undefined, defaultId: string | undefined = CAM_ID) {
  envMock.WHATSAPP_NUMBER_MAP = map
  envMock.WHATSAPP_PHONE_NUMBER_ID = defaultId
  envMock.WHATSAPP_PROVIDER = 'meta'
  delete envMock.TWILIO_WHATSAPP_FROM
  vi.resetModules()
  return import('@/lib/whatsapp/number-registry')
}

let warn: ReturnType<typeof vi.spyOn>
let error: ReturnType<typeof vi.spyOn>
let info: ReturnType<typeof vi.spyOn>
beforeEach(() => {
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  error = vi.spyOn(console, 'error').mockImplementation(() => {})
  info = vi.spyOn(console, 'info').mockImplementation(() => {})
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe('countryForPhoneNumberId — contract table', () => {
  it('mapped id → its country', async () => {
    const { countryForPhoneNumberId } = await loadRegistry(
      JSON.stringify({ [EC_ID]: 'Ecuador', [MX_ID]: 'México' }),
    )
    expect(countryForPhoneNumberId(EC_ID)).toBe('Ecuador')
    expect(countryForPhoneNumberId(MX_ID)).toBe('México')
  })

  it('unmapped id, default CAM id, and empty inputs → null', async () => {
    const { countryForPhoneNumberId } = await loadRegistry(JSON.stringify({ [EC_ID]: 'Ecuador' }))
    expect(countryForPhoneNumberId(CAM_ID)).toBeNull()
    expect(countryForPhoneNumberId('999')).toBeNull()
    expect(countryForPhoneNumberId(null)).toBeNull()
    expect(countryForPhoneNumberId(undefined)).toBeNull()
    expect(countryForPhoneNumberId('')).toBeNull()
  })

  it('unsupported country value is dropped + warns; the rest of the map still loads', async () => {
    const { countryForPhoneNumberId } = await loadRegistry(
      JSON.stringify({ [EC_ID]: 'Ecuador', [MX_ID]: 'Brasil' }),
    )
    expect(countryForPhoneNumberId(EC_ID)).toBe('Ecuador')
    expect(countryForPhoneNumberId(MX_ID)).toBeNull()
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('whatsapp_number_map_bad_country'))
  })

  it('invalid JSON → empty registry, error logged, no throw', async () => {
    const { countryForPhoneNumberId } = await loadRegistry('{not json')
    expect(countryForPhoneNumberId(EC_ID)).toBeNull()
    expect(error).toHaveBeenCalledWith(expect.stringContaining('whatsapp_number_map_invalid_json'))
  })

  it('unset / empty env → empty registry, info logged', async () => {
    const { countryForPhoneNumberId } = await loadRegistry(undefined)
    expect(countryForPhoneNumberId(EC_ID)).toBeNull()
    expect(info).toHaveBeenCalledWith(expect.stringContaining('whatsapp_number_map_empty'))
  })

  it('two ids mapped to the same country are both honored', async () => {
    const { countryForPhoneNumberId } = await loadRegistry(
      JSON.stringify({ [EC_ID]: 'Ecuador', [MX_ID]: 'Ecuador' }),
    )
    expect(countryForPhoneNumberId(EC_ID)).toBe('Ecuador')
    expect(countryForPhoneNumberId(MX_ID)).toBe('Ecuador')
  })

  it('an explicit mapping for the default id wins over "default = generic"', async () => {
    const { countryForPhoneNumberId } = await loadRegistry(JSON.stringify({ [CAM_ID]: 'Ecuador' }))
    expect(countryForPhoneNumberId(CAM_ID)).toBe('Ecuador')
  })
})

describe('inboundNumberOutcome', () => {
  it('classifies scoped / generic / unknown_number', async () => {
    const { inboundNumberOutcome } = await loadRegistry(JSON.stringify({ [EC_ID]: 'Ecuador' }))
    expect(inboundNumberOutcome(EC_ID)).toBe('scoped')
    expect(inboundNumberOutcome(CAM_ID)).toBe('generic')
    expect(inboundNumberOutcome(undefined)).toBe('generic')
    expect(inboundNumberOutcome('777')).toBe('unknown_number')
  })
})

describe('Twilio provider — sender id is the E.164 business number', () => {
  it('defaultSenderId is TWILIO_WHATSAPP_FROM stripped to E.164; map keyed by E.164', async () => {
    envMock.WHATSAPP_NUMBER_MAP = JSON.stringify({ '+593111': 'Ecuador' })
    envMock.WHATSAPP_PROVIDER = 'twilio'
    envMock.TWILIO_WHATSAPP_FROM = 'whatsapp:+50250000000'
    envMock.WHATSAPP_PHONE_NUMBER_ID = undefined
    vi.resetModules()
    const { defaultSenderId, countryForSenderId, inboundNumberOutcome } = await import(
      '@/lib/whatsapp/number-registry'
    )
    expect(defaultSenderId()).toBe('+50250000000')
    expect(countryForSenderId('+593111')).toBe('Ecuador')
    expect(inboundNumberOutcome('+593111')).toBe('scoped')
    expect(inboundNumberOutcome('+50250000000')).toBe('generic')
    expect(inboundNumberOutcome('+521999')).toBe('unknown_number')
  })
})

describe('listWhatsAppNumbers', () => {
  it('default id first (country null, isDefault true), then map entries', async () => {
    const { listWhatsAppNumbers } = await loadRegistry(
      JSON.stringify({ [EC_ID]: 'Ecuador', [MX_ID]: 'México' }),
    )
    expect(listWhatsAppNumbers()).toEqual([
      { phoneNumberId: CAM_ID, country: null, isDefault: true },
      { phoneNumberId: EC_ID, country: 'Ecuador', isDefault: false },
      { phoneNumberId: MX_ID, country: 'México', isDefault: false },
    ])
  })

  it('does not duplicate the default id when it is also mapped', async () => {
    const { listWhatsAppNumbers } = await loadRegistry(JSON.stringify({ [CAM_ID]: 'Ecuador' }))
    expect(listWhatsAppNumbers()).toEqual([
      { phoneNumberId: CAM_ID, country: 'Ecuador', isDefault: true },
    ])
  })
})
