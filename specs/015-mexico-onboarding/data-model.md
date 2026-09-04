# Phase 1 Data Model: Mexico Onboarding

## 1. Database changes

**None.** Mexico reuses:

- `survey_profiles.scoring_answers_json jsonb` and `survey_profiles.nse_points smallint` — added by
  migration `0015_ecuador_onboarding.sql` (feature 014). Mexico writes its 6 NSE answers into
  `scoring_answers_json` and its point total into `nse_points`.
- `survey_profiles` geo columns: `state_province` = Estado, `municipality` = Municipio/Alcaldía,
  `neighborhood` = Colonia, `nse_region` = Kantar region, `in_quota_geo` / `geo_source` unchanged.
- Código Postal is stored as key `codigoPostal` inside `scoring_answers_json` (geo aid + sync field,
  not a scoring input). If `/speckit-tasks` finds a cleaner existing home (e.g. an unused profile
  column) it may move there — no schema change either way.
- `leads.quota_segment` holds the Mexico NSE level string (`"AB"` / `"C+"` / `"C"` / `"D+"` / `"D/E"`).
  `leads.score` stays null for Mexico; `leads.nse_points` carries the total.
- `quota_targets` / `quota_region_caps`: **data only**, `country = 'México'`. `dimension_value` for
  `nse` ∈ `{AB, C+, C, D+, D/E}` — all fit `varchar(20)`.

If feature 014 has **not** landed when Mexico is implemented, the `scoring_answers_json` + `nse_points`
columns (feature 014's `0015`) and the registry/`survey-plan.ts` groundwork move into this feature's
task list under its own migration number — see research R0. (Distinct from the optional roster
migration `0016` in §5.)

## 2. Country configuration (`src/lib/countries/mexico.ts`)

Implements the `CountryConfig` interface from feature 014
(`specs/014-ecuador-onboarding/contracts/country-config.md`):

```
country: "México"
nseLevels: ["AB", "C+", "C", "D+", "D/E"]              // ordered high → low
geoHierarchy: {
  stateProvinceLabel: "estado",
  municipalityLabel:  "municipio o alcaldía",
  neighborhoodLabel:  "colonia",                        // shown for Mexico
}
scoringQuestions: [ education, bathrooms, cars, homeInternet, workers14Plus, bedrooms, codigoPostal* ]
computeNse(answers): { points, level }                  // see contracts/mexico-nse-scoring.md
resolveNseRegion(geo): string | null                    // see contracts/mexico-geo-catalog.md
validatePhone(raw): { ok, normalized }                  // 10 digits, strip 52 / 1 / 0 prefixes
```

\* `codigoPostal` is a free-text geo question in the Mexico block, not scored; `computeNse` ignores it.

`registry.ts` adds: the 7 CAM names → `camConfig`, `Ecuador` → `ecuadorConfig`, `México` →
`mexicoConfig`, unknown/null → `camConfig`.

### `scoring_answers_json` keys for Mexico

`educationHoh`, `fullBathrooms`, `vehicleCount`, `homeInternet`, `workers14Plus`, `bedrooms`,
`codigoPostal` (non-scoring).

## 3. Static data files

### 3.1 `data/scoring/mexico-nse.json`

```
{
  "version": "docs/mexico/Muestra Regiones NSE Mexico.xlsx",
  "variables": {
    "educationHoh":  { "Sin instrucción escolar": 0, "Alfabetizado sin escuela formal": 0,
                       "Primaria incompleta": 6, "Primaria completa": 11,
                       "Secundaria incompleta": 12, "Secundaria completa": 18,
                       "Prepa/Bachillerato incompleta": 23, "Prepa/Bachillerato completa": 27,
                       "Licenciatura incompleta": 36, "Licenciatura completa": 59,
                       "Posgrado incompleto": 85, "Posgrado completo": 85 },
    "fullBathrooms": { "0": 0, "1": 24, "2 o más": 47 },
    "vehicleCount":  { "0": 0, "1": 22, "2 o más": 43 },
    "homeInternet":  { "No tiene": 0, "Sí tiene": 32 },
    "workers14Plus": { "0": 0, "1": 15, "2": 31, "3": 46, "4 o más": 61 },
    "bedrooms":      { "0": 0, "1": 8, "2": 16, "3": 24, "4 o más": 32 }
  },
  "levelCutoffs": [
    { "maxPoints": 99,   "level": "D/E" },
    { "maxPoints": 140,  "level": "D+" },
    { "maxPoints": 167,  "level": "C" },
    { "maxPoints": 201,  "level": "C+" },
    { "maxPoints": 9999, "level": "AB" }
  ]
}
```

### 3.2 `data/geo/mexico-nse-regions.json`

```
{
  "version": "docs/mexico/Muestra Regiones NSE Mexico.xlsx",
  "source": "Kantar región / INEGI estado-municipio",
  "regions": [
    { "region": "AMCM",   "regionCode": "5", "estrato": "1",
      "estado": "Distrito Federal", "municipio": "IZTAPALAPA" },
    { "region": "Centro", "regionCode": "4", "estrato": "1",
      "estado": "Hidalgo", "municipio": "TULA DE ALLENDE" }
    // … ~1,900 rows, all Kantar regions present in the sheet
  ]
}
```

Kantar region set = whatever the catalog sheet contains (at least `AMCM`, `Centro`, `Sureste`,
`Occidente`, `Norte`, …) — transcribed verbatim.

## 4. Resolved-survey structure

`resolveSurveyQuestions("México")` = `[...SHARED_PREFIX, ...mexicoConfig.scoringQuestions,
...SHARED_SUFFIX]` (mechanism defined in feature 014's data-model §4).

| Segment | Fields |
|---------|--------|
| SHARED_PREFIX | fullName, country, stateProvince (estado), municipality (municipio), neighborhood (colonia), email, gender, age |
| Mexico NSE block | educationHoh, fullBathrooms, vehicleCount, homeInternet, workers14Plus, bedrooms, householdSize, codigoPostal |
| SHARED_SUFFIX | isPregnant, hasBabyUnder3, shoppingFrequency, shoppingCategories, contactChannel, contactSchedule |

Notes:
- `bedrooms` is a **scoring input for Mexico** (unlike CAM where it feeds hacinamiento, and Ecuador
  where it isn't asked) — the AMAI "cuartos para dormir" variable. It reuses the existing
  `survey_profiles.bedrooms smallint` column *and* is mirrored into `scoring_answers_json`.
- `householdSize` stays shared (needed for the `integrantes` quota dimension).
- `codigoPostal` is a Mexico-only free-text question at the end of the geo/NSE block.
- Colonia (`neighborhood`) shown for Mexico; Q5-hidden backstops check `geoHierarchy.neighborhoodLabel`.

## 5. Roster (per-member phone / email) — gated on spike T003a

The Mexico questionnaire asks each additional adult member for a name + personal phone + email. There
is **no per-member data model in the codebase today** (`ficha_hogar_profiles` is one respondent-only
row per lead; no member array anywhere). Task **T003a** decides:

- **Option A (default) — defer** to a separate "México ficha del hogar" feature. No data-model change
  here; 015 stays migration-free; FR-003's member clause drops.
- **Option B — minimal member store**: add `survey_profiles.household_members jsonb`
  (`[{ givenName, familyName, personalPhone?, personalEmail? }]`) via migration
  `0016_mexico_household_members.sql` (apply to the live Neon branch with the `schema.ts` edit), plus
  a minimal "name the other adults" step. Name + phone + email only. Include the array in the sync
  snapshot. Third-party-data handling per §6-note and FR-022 / FR-024.

Not in scope either way: relationship-to-HoH, per-member sex/DOB, disability, unlimited-data-package.

## 6. Observability

Reuses feature 014's structured logs, emitting `country: "México"`:

| Event | Fields |
|-------|--------|
| `nse_score` | `lead_id`, `country`, `points`, `level`, `contributions: { [variableKey]: points }` |
| `geo_resolve` | `lead_id`, `country`, `estado`, `municipio`, `codigo_postal`, `matched_region` \| `null` |
| `quota_check` | *(existing — unchanged)* |

## 7. Downstream sync

`panel-smart` / TDM payload already carries `country` + `nse_region`. Add `nse_points` + NSE `level`
+ `codigoPostal` to the synced-answers snapshot so an accepted Mexico lead lands tagged `México` with
region + level + CP (FR-013, SC-006). No new sync endpoint.
