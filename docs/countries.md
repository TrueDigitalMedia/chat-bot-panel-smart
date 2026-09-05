# Country configuration registry (`src/lib/countries/`)

Constitution v1.2.0 **Principle V — Country-Scoped Recruitment Configuration**:

> Per-country recruitment behavior (questionnaire content, socioeconomic scoring, geo
> resolution, phone validation, sensitive-industry screening) lives in one `CountryConfig`
> object per country. `getCountryConfig(country)` in `registry.ts` is the **only** place a
> country name is switched on. Every other module in the conversation / scoring / geo
> pipeline calls a method on the returned `CountryConfig` — it never branches on the country
> string itself.

## The pieces

| File | What it is |
|------|-----------|
| `types.ts` | The `CountryConfig` interface + `NseResult` / `GeoHierarchy`. |
| `registry.ts` | `getCountryConfig()` — the sole country-name switch. Also `isSupportedCountry()`, `listSupportedCountries()`, `listNseRegionsForSupportedCountry()`, `canonicalNseRegionForSupportedCountry()` for admin tooling that needs to enumerate/canonicalize across every country. |
| `cam.ts` | `makeCamConfig(country)` — a factory returning one `CountryConfig` for any of the 7 CAM/RD markets (Guatemala, Honduras, El Salvador, Nicaragua, Costa Rica, Rep. Dominicana, Panamá). Wraps the pre-existing SCL-CAM scoring / geo / question code **unchanged**. |
| `ecuador.ts` | `ecuadorConfig` — Ecuador's questionnaire block, 8-variable NSE scoring, geo hierarchy, phone rule, and conflict-of-interest screening. |

## `CountryConfig` surface

```ts
interface CountryConfig {
  country: string                          // canonical name stored on leads/survey_profiles/quota rows
  nseLevels: readonly string[]             // high→low; exact strings written to leads.quota_segment
  geoHierarchy: GeoHierarchy               // Q3/Q4/Q5 nouns; neighborhoodLabel: null hides Q5 (CAM)
  scoringQuestions: readonly SurveyQuestion[]   // spliced between SHARED_PREFIX and SHARED_SUFFIX
  screeningIndustries: readonly InlineKeyboardButton[][]
  computeNse(answers): NseResult           // { points, level }
  resolveNseRegion(geo): string | null     // null = out of geographic quota
  validatePhone(raw): { ok, normalized }   // normalized is E.164 "+<digits>" for every country
  listNseRegions(): readonly string[]      // every valid nse_region / quota_targets.region value
}
```

Survey questions are assembled by `src/lib/conversation/survey-plan.ts`:
`resolveSurveyQuestions(country)` = `SHARED_PREFIX` (8) + `config.scoringQuestions` +
`SHARED_SUFFIX` (4), re-indexed. For a CAM/RD country this is **byte-identical** to the
pre-registry fixed `SURVEY_QUESTIONS` array — guarded by
`tests/unit/country-config-registry.test.ts` and the CAM golden-master regression suite
(`tests/regression/`, run with `npm run test:regression`).

## Adding a country

1. New `src/lib/countries/<country>.ts` exporting a `CountryConfig` (data + the geo
   catalog / scoring table it needs, typically JSON under `data/`).
2. One line in `registry.ts`'s `getCountryConfig` / `isSupportedCountry` /
   `listSupportedCountries`.
3. Add its Q2 button label to `SHARED_PREFIX`'s `country` question in
   `src/lib/conversation/survey-questions.ts`.
4. A migration if any scoring answer needs a dedicated column (non-column scoring fields
   merge into `survey_profiles.scoring_answers_json` — see `phase-1.ts`'s
   `NON_COLUMN_SCORING_FIELDS`).
5. Run `npm run test:regression` — zero snapshot diff proves existing markets are untouched.

## Known Principle V deviations (pre-014, not introduced by the registry)

- `phase-1.ts` / `survey-capture.ts`: `const isGuatemala = country === 'Guatemala'` gating
  `validateGuatemalaGeoField` (spec 002-era Guatemala-only geo validation). The generic
  path is `validateCountryGeoField` (`src/lib/geo/country-catalog.ts`); Guatemala has an
  extra zona/barrio layer that hasn't been folded into a `CountryConfig` method yet.
- `cam.ts`: `makeCamConfig` picks Costa Rica's / Guatemala's `geoHierarchy` by name. This
  is inside the `countries/` module (config assembly), not the conversation pipeline, but
  it is still a name switch and could become per-name factory data.

Both are tracked for a follow-up; neither is a new branch and both are covered by the CAM
regression suite.
