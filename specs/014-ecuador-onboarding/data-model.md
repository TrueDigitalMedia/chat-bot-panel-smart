# Phase 1 Data Model: Ecuador Onboarding

## 1. Database changes

### 1.1 `survey_profiles` — new columns (migration `0015_ecuador_onboarding.sql`)

| Column | Type | Null | Notes |
|--------|------|------|-------|
| `scoring_answers_json` | `jsonb` | yes | `{ [variableKey]: string }` — the raw NSE answers for the lead's country. CAM mirrors its typed columns here; Ecuador stores its 8 variables here only. |
| `nse_points` | `smallint` | yes | Country NSE point total (Ecuador 0–500; CAM keeps using `score`). Populated at survey completion. FR-017 audit. |

No columns are dropped or renamed. `score` (CAM SCL-CAM score) is unchanged; for Ecuador `score` is
left null and `nse_points` carries the total. `quota_segment` semantics widen: it already holds the
country NSE level string; Ecuador writes `"AB"` / `"C"` / `"D/E"`.

Existing geo columns are reused for Ecuador: `state_province` = Provincia, `municipality` = Cantón,
`neighborhood` = Parroquia / Parroquia Urbana, `nse_region` = Ecuador Región, `in_quota_geo` /
`geo_source` unchanged.

### 1.2 `quota_targets` / `quota_region_caps` — data only

No schema change. Ecuador rows use `country = 'Ecuador'`, `region ∈` Ecuador Región names,
`dimension_type ∈ {nse, edad, integrantes}`, `dimension_value` for `nse` ∈ `{AB, C, D/E}`.
`quota_region_caps.country = 'Ecuador'` per region. Note `dimension_value` is `varchar(20)` — `"D/E"`
fits.

### 1.3 Migration outline

```sql
ALTER TABLE survey_profiles ADD COLUMN scoring_answers_json jsonb;
ALTER TABLE survey_profiles ADD COLUMN nse_points smallint;
```

Per memory `feedback_migrations_must_be_applied`: this migration MUST be run against the live Neon DB
in the same change as the `schema.ts` edit.

## 2. Country configuration (in-memory, `src/lib/countries/`)

### 2.1 `CountryConfig` (see contracts/country-config.md)

```
interface CountryConfig {
  country: string                       // canonical survey name, e.g. "Ecuador"
  nseLevels: string[]                   // ordered high→low, e.g. ["AB","C","D/E"]
  geoHierarchy: {                       // labels for survey Q3/Q4/Q5
    stateProvinceLabel: string          // "provincia"
    municipalityLabel: string           // "cantón"
    neighborhoodLabel: string | null    // "parroquia"  (null = hidden, CAM behavior)
  }
  scoringQuestions: SurveyQuestion[]    // the NSE block inserted between prefix and suffix
  computeNse(answers: Record<string,string>): NseResult
  resolveNseRegion(geo: { stateProvince, municipality, neighborhood }): string | null
  validatePhone(raw: string): { ok: boolean; normalized: string | null }
}

interface NseResult { points: number; level: string }   // level ∈ nseLevels
```

- `getCountryConfig(country)` → the matching config, or the `camConfig` for the 7 CAM/RD names.
  This function is the **only** place a country name is switched on.
- `camConfig` wraps existing code unchanged: `scoringQuestions` = today's Q9–Q12 + Q15 objects;
  `computeNse` = `{ points: calculateScore(f), level: getQuotaSegment(calculateScore(f)) }`;
  `resolveNseRegion` = `lookupNseRegion`; `validatePhone` = existing generic check.

### 2.2 Ecuador scoring variable keys (`scoring_answers_json` keys)

`healthInsurancePsh`, `monthlyIncome`, `dwellingFinishes`, `floorMaterial`, `vehicleCount`,
`occupationHead`, `occupationAma`, `educationPsh`, `internetAccess`.
(`occupationHead` + `occupationAma` → `computeNse` takes `max(points)`; see research R2.)

## 3. Static data files

### 3.1 `data/scoring/ecuador-nse.json`

```
{
  "version": "docs/ecuador/Muestra Regiones NSE Ecuador.xlsx",
  "variables": {
    "healthInsurancePsh": { "Ninguno": 0, "IESS": 2, "Issfa": 6, "Isspol": 6, "Privada": 10 },
    "monthlyIncome":      { "Hasta $400": 1, "$401-$700": 2, ... "Más de $3.000": 6 },
    "dwellingFinishes":   { ... 0,3,6,9,12 },
    "floorMaterial":      { ... 10,7,4,2,0 },
    "vehicleCount":       { "0": 0, "1": 6, "2": 9, "3": 12, "4 o más": 14 },
    "occupation":         { "Directivo…": 13, "Profesionales científicos…": 12, ... },
    "educationPsh":       { "Ninguno": 0, "Alfabetizado": 1, ... "Post grado completo": 20 },
    "internetAccess":     { "No internet": 0, "Celular": 3, "Cable": 8, "Fibra óptica": 15 }
  },
  "levelCutoffs": [
    { "maxPoints": 50,   "level": "D/E" },
    { "maxPoints": 75,   "level": "C" },
    { "maxPoints": 9999, "level": "AB" }
  ]
}
```

Full option→point values are in [contracts/ecuador-nse-scoring.md](./contracts/ecuador-nse-scoring.md).

### 3.2 `data/geo/ecuador-nse-regions.json`

```
{
  "version": "docs/ecuador/Muestra Regiones NSE Ecuador.xlsx",
  "source": "INEC clasificación 2022",
  "regions": [
    { "region": "Guayaquil Norte", "provincia": "GUAYAS", "canton": "GUAYAQUIL",
      "parroquia": "GUAYAQUIL", "parroquiaUrbana": "TARQUI" },
    { "region": "Quito Sur", "provincia": "PICHINCHA", "canton": "DISTRITO METROPOLITANO DE QUITO",
      "parroquia": "QUITO", "parroquiaUrbana": "SOLANDA" },
    { "region": "Sierra", "provincia": "AZUAY", "canton": "GUALACEO",
      "parroquia": "GUALACEO", "parroquiaUrbana": "GUALACEO" }
    // … ~1,000 rows
  ]
}
```

Región set (from catalog): Costa Norte, Costa Sur, Sierra, Cuenca, Santo Domingo, Manta–Portoviejo,
Guayaquil Norte, Guayaquil Sur, Quito Norte, Quito Sur, Zona Periferia/Valles, Zona Periferia GYE.

## 4. Resolved-survey structure (`survey-plan.ts`)

`resolveSurveyQuestions(country)` = `[...SHARED_PREFIX, ...getCountryConfig(country).scoringQuestions,
...SHARED_SUFFIX]`, each `SurveyQuestion` re-`index`ed 1..N in position order.

| Segment | Fields |
|---------|--------|
| SHARED_PREFIX | fullName, country, stateProvince, municipality, neighborhood, email, gender, age |
| CAM NSE block | educationPsh, cars, domesticHelp, householdSize, bedrooms *(identical to today's array — resolved CAM list == current `SURVEY_QUESTIONS`)* |
| Ecuador NSE block | healthInsurancePsh, monthlyIncome, dwellingFinishes, floorMaterial, vehicleCount, occupationHead, occupationAma, educationPsh, householdSize, internetAccess |
| SHARED_SUFFIX | isPregnant, hasBabyUnder3, shoppingFrequency, shoppingCategories, contactChannel, contactSchedule |

Notes:
- `householdSize` stays in the shared model (needed for the `integrantes` quota dimension and CAM
  hacinamiento); it appears in each country's NSE block position so ordering matches the paper form.
- `neighborhood` (Parroquia) is **shown for Ecuador** (`geoHierarchy.neighborhoodLabel != null`) and
  stays hidden for CAM — the existing "skip Q5" backstops check the label.
- `bedrooms` is CAM-only (hacinamiento input); not asked for Ecuador.

## 5. State / flow impact

- `flow_states.survey_question_index` and `leads.survey_question_index` remain 1-based positions into
  the lead's **country-resolved** list. Country is set at prefix Q2, so resolution is stable for the
  rest of the survey.
- `correction-fields.ts` (`questionIndexForField`) becomes country-aware: given a field + country,
  return its position in `resolveSurveyQuestions(country)`.
- Survey-completion scoring in `phases/phase-1.ts` and `geo/handle-confirm.ts`:
  `const cfg = getCountryConfig(profile.country); const { points, level } = cfg.computeNse(answers);`
  then `leads.score` (CAM only) / `leads.nse_points` + `leads.quota_segment = level`, then
  `checkQuotaAvailability({ segment: level, ... })` unchanged.

## 6. Observability (Principle II)

| Event | Fields |
|-------|--------|
| `nse_score` | `lead_id`, `country`, `points`, `level`, `contributions: { [variableKey]: points }` |
| `geo_resolve` | `lead_id`, `country`, `provincia`, `canton`, `parroquia`, `matched_region` \| `null`, `source` |
| `quota_check` | *(existing — unchanged)* |

## 7. Downstream sync

`panel-smart` / TDM registration payload already carries `country` and `nse_region` from
`survey_profiles`. Add `nse_points` / NSE `level` to the synced-answers snapshot so an accepted Ecuador
lead lands tagged `Ecuador` with region + level (FR-013, SC-006). No new sync endpoint.
