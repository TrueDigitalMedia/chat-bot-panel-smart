# Contract: Country Configuration Registry

**Module**: `src/lib/countries/` · **Consumers**: `conversation/survey-plan.ts`,
`conversation/send-survey-question.ts`, `conversation/phases/phase-1.ts`, `geo/handle-confirm.ts`,
`conversation/correction-fields.ts`, `app/admin/quotas/*`.

## Interface

```ts
export interface NseResult {
  points: number      // country point total (>= 0)
  level: string        // MUST be one of CountryConfig.nseLevels
}

export interface GeoHierarchy {
  stateProvinceLabel: string        // survey Q3 noun, e.g. "provincia" / "departamento"
  municipalityLabel: string          // survey Q4 noun, e.g. "cantón" / "municipio"
  neighborhoodLabel: string | null   // survey Q5 noun, or null to keep Q5 hidden (CAM default)
}

export interface CountryConfig {
  country: string
  nseLevels: readonly string[]                 // ordered high → low
  geoHierarchy: GeoHierarchy
  scoringQuestions: readonly SurveyQuestion[]   // inserted between SHARED_PREFIX and SHARED_SUFFIX
  computeNse(answers: Record<string, string>): NseResult
  resolveNseRegion(geo: {
    stateProvince: string | null
    municipality: string | null
    neighborhood: string | null
  }): string | null                            // null = out of geographic quota
  validatePhone(raw: string): { ok: boolean; normalized: string | null }
}

export function getCountryConfig(country: string | null | undefined): CountryConfig
```

## Rules

1. `getCountryConfig` is the **only** function in the codebase permitted to branch on a country name.
   Any other `if (country === …)` in a shared path is a Principle V violation.
2. Unknown / null country → returns `camConfig` (back-compat: today's behavior is the CAM path).
   The 7 names `Guatemala, Honduras, El Salvador, Nicaragua, Costa Rica, Rep. Dominicana, Panamá` →
   `camConfig`. `Ecuador` → `ecuadorConfig`.
3. `camConfig` MUST delegate to the existing implementations without altering them:
   - `computeNse(f)` → `{ points: calculateScore(f), level: getQuotaSegment(calculateScore(f)) }`
   - `resolveNseRegion` → `lookupNseRegion(country, stateProvince, municipality)`
   - `scoringQuestions` → the exact `SurveyQuestion` objects currently at Q9–Q12 and Q15
   - `validatePhone` → the current generic survey phone check
   - `geoHierarchy.neighborhoodLabel` → `null` (except where `send-survey-question.ts` already
     special-cases Guatemala/Costa Rica wording — that logic moves into their `geoHierarchy`).
4. `computeNse` MUST be pure and deterministic. Missing/unknown answer keys contribute 0 points.
5. `nseLevels` values are the exact strings written to `leads.quota_segment` and offered in the admin
   NSE dimension dropdown for that country.

## Backward-compatibility test (blocking)

`tests/unit/country-config-registry.test.ts`:

- For each CAM/RD country, `getCountryConfig(name).scoringQuestions` deep-equals the current
  `SURVEY_QUESTIONS` slice, and `resolveSurveyQuestions(name)` deep-equals today's `SURVEY_QUESTIONS`.
- For a table of CAM survey profiles, `camConfig.computeNse` returns the same `score` and `segment` as
  calling `calculateScore` + `getQuotaSegment` directly (golden values from existing
  `tests/unit/*scoring*`).
- `getCountryConfig(undefined) === getCountryConfig('Guatemala').constructor`-equivalent (camConfig).
