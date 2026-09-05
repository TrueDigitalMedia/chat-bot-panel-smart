import { describe, it, expect } from 'vitest'
import { getCountryConfig, isSupportedCountry } from '@/lib/countries/registry'
import { resolveSurveyQuestions } from '@/lib/conversation/survey-plan'
import { calculateScore, getQuotaSegment } from '@/lib/scoring/socioeconomic'

// Constitution v1.2.0 Principle V: registry.ts is the ONLY place a country name is
// switched on. This suite pins that every CAM/RD name resolves to a byte-identical
// question list and identical scoring behavior — 016's send-time skip helper for Q5
// doesn't change the resolved list or its indices, so this assertion stays valid.
const CAM_COUNTRY_NAMES = [
  'Guatemala',
  'Honduras',
  'El Salvador',
  'Nicaragua',
  'Costa Rica',
  'Rep. Dominicana',
  'Panamá',
] as const

describe('getCountryConfig — CAM/RD countries', () => {
  it('every CAM/RD name resolves to a CountryConfig with matching .country', () => {
    for (const name of CAM_COUNTRY_NAMES) {
      const cfg = getCountryConfig(name)
      expect(cfg.country).toBe(name)
      expect(cfg.nseLevels).toEqual(['Nivel 1', 'Nivel 2', 'Nivel 3', 'Nivel 4'])
    }
  })

  it('every CAM/RD name resolves the same question field-name list, in the same order', () => {
    const reference = resolveSurveyQuestions('Guatemala').map((q) => q.fieldName)
    for (const name of CAM_COUNTRY_NAMES) {
      expect(resolveSurveyQuestions(name).map((q) => q.fieldName)).toEqual(reference)
    }
  })

  it('getCountryConfig(undefined) and getCountryConfig(null) both fall back to the CAM default (Guatemala shape)', () => {
    const undefinedCfg = getCountryConfig(undefined)
    const nullCfg = getCountryConfig(null)
    const guatemalaCfg = getCountryConfig('Guatemala')
    expect(undefinedCfg.country).toBe('Guatemala')
    expect(nullCfg.country).toBe('Guatemala')
    expect(undefinedCfg.nseLevels).toEqual(guatemalaCfg.nseLevels)
  })

  it('an unrecognized country name also falls back to the CAM default', () => {
    const cfg = getCountryConfig('Narnia')
    expect(cfg.country).toBe('Guatemala')
  })

  it('camConfig.computeNse matches the golden calculateScore/getQuotaSegment values for a known high-SES profile', () => {
    const cfg = getCountryConfig('Guatemala')
    const answers = {
      educationPsh: 'Universidad Completa',
      cars: '2 o más',
      domesticHelp: false,
      householdSize: 4,
      bedrooms: 2,
    }
    const result = cfg.computeNse(answers)
    expect(result.points).toBe(calculateScore(answers))
    expect(result.level).toBe(getQuotaSegment(calculateScore(answers)))
    expect(result.points).toBe(775)
    expect(result.level).toBe('Nivel 1')
  })

  it('camConfig.computeNse matches the golden values for a known low-SES profile', () => {
    const cfg = getCountryConfig('Honduras')
    const answers = {
      educationPsh: 'No alfabetizado',
      cars: '0',
      domesticHelp: false,
      householdSize: 6,
      bedrooms: 0,
    }
    const result = cfg.computeNse(answers)
    expect(result.points).toBe(calculateScore(answers))
    expect(result.level).toBe(getQuotaSegment(calculateScore(answers)))
    expect(result.points).toBe(0)
    expect(result.level).toBe('Nivel 4')
  })

  it('camConfig.computeNse handles missing/null fields the same as the golden calculateScore', () => {
    const cfg = getCountryConfig('Costa Rica')
    const answers = {
      educationPsh: null,
      cars: null,
      domesticHelp: null,
      householdSize: null,
      bedrooms: null,
    }
    const result = cfg.computeNse(answers)
    expect(result.points).toBe(calculateScore(answers))
    expect(result.points).toBe(0)
  })

  it('Costa Rica and Guatemala have their own geoHierarchy wording; other CAM/RD countries share the generic one', () => {
    expect(getCountryConfig('Costa Rica').geoHierarchy.municipalityLabel).toBe('municipio o cantón')
    expect(getCountryConfig('Guatemala').geoHierarchy.stateProvinceLabel).toBe('departamento de Guatemala')
    expect(getCountryConfig('Honduras').geoHierarchy.municipalityLabel).toBe('municipio')
    expect(getCountryConfig('Honduras').geoHierarchy.stateProvinceLabel).toBe('provincia/departamento')
  })

  it('every CAM/RD country has no neighborhood label (Q5 stays hidden)', () => {
    for (const name of CAM_COUNTRY_NAMES) {
      expect(getCountryConfig(name).geoHierarchy.neighborhoodLabel).toBeNull()
    }
  })

  it('CAM/RD countries have no sensitive-industry screening question', () => {
    for (const name of CAM_COUNTRY_NAMES) {
      expect(getCountryConfig(name).screeningIndustries).toEqual([])
    }
  })

  it('camConfig.validatePhone keeps an already-E.164 number byte-identical (so phase-1 re-validation never rewrites it)', () => {
    const cfg = getCountryConfig('Panamá')
    expect(cfg.validatePhone('+50761234567')).toEqual({ ok: true, normalized: '+50761234567' })
    // adds the "+" for a bare international-length number, like normalizePhone
    expect(cfg.validatePhone('50761234567')).toEqual({ ok: true, normalized: '+50761234567' })
    expect(cfg.validatePhone('123').ok).toBe(false)
  })

  it('isSupportedCountry is true for every CAM/RD name and Ecuador, false otherwise', () => {
    for (const name of CAM_COUNTRY_NAMES) {
      expect(isSupportedCountry(name)).toBe(true)
    }
    expect(isSupportedCountry('Ecuador')).toBe(true)
    expect(isSupportedCountry('Narnia')).toBe(false)
    expect(isSupportedCountry(null)).toBe(false)
    expect(isSupportedCountry(undefined)).toBe(false)
  })
})

describe('getCountryConfig — Ecuador', () => {
  it('resolves a distinct CountryConfig with the Ecuador NSE level bands', () => {
    const cfg = getCountryConfig('Ecuador')
    expect(cfg.country).toBe('Ecuador')
    expect(cfg.nseLevels).toEqual(['AB', 'C', 'D/E'])
  })

  it('has its own geoHierarchy — parroquia is a real (non-hidden) Q5', () => {
    const cfg = getCountryConfig('Ecuador')
    expect(cfg.geoHierarchy).toEqual({
      stateProvinceLabel: 'provincia',
      municipalityLabel: 'cantón',
      neighborhoodLabel: 'parroquia',
    })
  })

  it('has a non-empty sensitive-industry screening question (unlike every CAM/RD country)', () => {
    const cfg = getCountryConfig('Ecuador')
    expect(cfg.screeningIndustries.length).toBeGreaterThan(0)
  })

  it('validatePhone strips 593/leading-0 and returns E.164 +593XXXXXXXXX', () => {
    const cfg = getCountryConfig('Ecuador')
    expect(cfg.validatePhone('+593987654321')).toEqual({ ok: true, normalized: '+593987654321' })
    expect(cfg.validatePhone('0987654321')).toEqual({ ok: true, normalized: '+593987654321' })
    expect(cfg.validatePhone('987654321')).toEqual({ ok: true, normalized: '+593987654321' })
    expect(cfg.validatePhone('12345').ok).toBe(false)
  })

  it('lists exactly the 12 known Ecuador NSE regions', () => {
    expect(getCountryConfig('Ecuador').listNseRegions().length).toBe(12)
  })

  it('is not present in the CAM/RD name list (no country-name collision)', () => {
    expect(CAM_COUNTRY_NAMES as readonly string[]).not.toContain('Ecuador')
  })
})

describe('getCountryConfig — México (spec 015)', () => {
  it('resolves a distinct CountryConfig with the 5 AMAI NSE levels', () => {
    const cfg = getCountryConfig('México')
    expect(cfg.country).toBe('México')
    expect(cfg.nseLevels).toEqual(['AB', 'C+', 'C', 'D+', 'D/E'])
  })

  it('has its own geoHierarchy — colonia is a real (non-hidden) Q5', () => {
    expect(getCountryConfig('México').geoHierarchy).toEqual({
      stateProvinceLabel: 'estado',
      municipalityLabel: 'municipio o alcaldía',
      neighborhoodLabel: 'colonia',
    })
  })

  it('has a non-empty sensitive-industry screening question', () => {
    expect(getCountryConfig('México').screeningIndustries.length).toBeGreaterThan(0)
  })

  it('validatePhone strips 52 / trailing-1 / leading-0 and returns E.164 +52XXXXXXXXXX', () => {
    const cfg = getCountryConfig('México')
    expect(cfg.validatePhone('+525512345678')).toEqual({ ok: true, normalized: '+525512345678' })
    expect(cfg.validatePhone('5215512345678')).toEqual({ ok: true, normalized: '+525512345678' }) // old 1-prefix
    expect(cfg.validatePhone('05512345678')).toEqual({ ok: true, normalized: '+525512345678' }) // single leading 0
    expect(cfg.validatePhone('5512345678')).toEqual({ ok: true, normalized: '+525512345678' })
    expect(cfg.validatePhone('12345').ok).toBe(false)
  })

  it('lists the Kantar regions from the catalog', () => {
    const regions = getCountryConfig('México').listNseRegions()
    expect(regions.length).toBeGreaterThan(0)
    expect(regions).toContain('AMCM')
  })

  it('isSupportedCountry is true for México; getCountryConfig(unknown) still falls back to CAM', () => {
    expect(isSupportedCountry('México')).toBe(true)
    expect(getCountryConfig('Narnia').country).toBe('Guatemala')
  })

  it('registering México did not change the CAM or Ecuador resolved question lists', () => {
    // Guard: CAM stays 19, Ecuador stays 25 (spec 015 T008 / SC-004)
    expect(resolveSurveyQuestions('Guatemala').length).toBe(19)
    expect(resolveSurveyQuestions('Ecuador').length).toBe(25)
  })
})
