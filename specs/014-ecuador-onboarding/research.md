# Phase 0 Research: Ecuador Onboarding

All values transcribed from `docs/ecuador/Cuestionario Ecuador.docx` and
`docs/ecuador/Muestra Regiones NSE Ecuador.xlsx` (sheets: catalog, `TABLA DE PUNTOS`, sample).

## R1. Ecuador NSE point tables

**Decision**: Ecuador NSE = simple additive sum of 8 variable point values, then banded to a level.
Store the tables as a static JSON data file (`data/scoring/ecuador-nse.json`), not code, so the
research team can be shown/diff the numbers and Mexico (`015`) follows the same pattern.

Point tables (option → points):

| Variable | Options → points |
|----------|------------------|
| Seguro de salud del PSH | Ninguno 0 · IESS 2 · Issfa (militares/Gobierno) 6 · Isspol (policías) 6 · Privada 10 |
| Ingresos del hogar mensuales | Hasta $400 → 1 · $401–$700 → 2 · $701–$1.000 → 3 · $1.001–$2.000 → 4 · $2.001–$3.000 → 5 · Más de $3.000 → 6 |
| Acabados de la vivienda | Tabla/madera + desechos o cartón 0 · Tabla/madera + eternit o zinc 3 · Cemento + eternit o zinc 6 · Cemento/ladrillo + loza o teja 9 · Otro (acabados de lujo) 12 |
| Material de piso predominante | Duela/parquet/tablón/flotante 10 · Cerámica/baldosa/vinil/marmetón 7 · Ladrillo o cemento 4 · Tierra/caña 2 · Otros materiales 0 |
| Número de vehículos (uso personal) | 0 → 0 · 1 → 6 · 2 → 9 · 3 → 12 · 4 o más → 14 |
| Máxima ocupación del jefe y/o ama | Directivo admón. pública/empresas 13 · Profesionales científicos e intelectuales 12 · Técnicos y profesionales nivel medio 9 · Empleados de oficina 6 · Trabajadores de servicios y comerciantes 4 · Trabajadores calificados agropecuarios y pesqueros 3 · Oficiales, operarios y artesanos 3 · Operadores de instalaciones y máquinas 4 · Trabajadores no calificados 0 · Fuerzas Armadas 8 · Desocupados 1 · Inactivos/Jubilado 3 |
| Máxima educación del PSH | Ninguno/No alfabetizado 0 · Alfabetizado (sin escuela formal) 1 · Básica incompleta 3 · Básica completa 4 · Media incompleta 5 · Media completa 6 · Técnica incompleta 8 · Técnica completa 10 · Universidad incompleta 12 · Universidad completa 15 · Post grado incompleto 20 · Post grado completo 20 |
| Internet | No internet 0 · Internet de celular 3 · Internet hogar (cable) 8 · Internet hogar (fibra óptica) 15 |

**Level cutoffs (the 3-band level used for quota)**: total `0–50 → "D/E"`, `51–75 → "C"`,
`76 and above → "AB"`. The workbook also carries a finer A/B/C/D/E band (E 0–30, D 31–50, C 51–75,
B 76–90, A 91+) — **kept only as `nse_points` provenance; not exposed to the quota engine**.

**Rationale**: matches the workbook's `Resultado Final` collapsed column; the spec (US5) offers only
"AB", "C", "D/E" in the admin NSE dimension.

**Worked-example note**: the sample row in the workbook sums to **52 → "C"** but its *Acabados de la
vivienda* points cell is blank (data-entry gap) even though the option shown ("Cemento + eternit o
zinc") is worth 6. With the table applied fully the same household scores **58 → still "C"**. The
transcribed tables in `ecuador-nse.json` are the single source of truth for tests; the `52` figure is
recorded only as provenance. `tests/unit/ecuador-nse.test.ts` asserts constructed cases at each cutoff
boundary (50/51, 75/76) plus this household at 58.

**Missing / "No sé, no recuerdo"**: the variable contributes 0 points and scoring continues (matches
current CAM tolerance in `scoring/socioeconomic.ts`).

## R2. "Máxima Ocupación del jefe y/o ama"

**Decision**: when both the head of household and the "ama de casa" have a known occupation, use the
**higher of the two point values**; when only one is known, use that one; when neither, 0.
**Rationale**: the workbook label is "jefe y/o ama" (either/or) and NSE instruments of this family
score the household's best occupational position. Confirmed against spec assumption.
**Alternatives**: always use PSH only (rejected — loses signal when the ama is the higher earner);
ask the user which to use (rejected — extra turn, no business value).

## R3. Guayaquil / Quito parroquia-urbana granularity

**Decision**: The catalog keys Guayaquil and Quito on **Parroquia Urbana** (e.g. "Tarqui" → Guayaquil
Norte, "Solanda" → Quito Sur), and on **Parroquia** elsewhere. Ask the parroquia question once
(survey Q5-equivalent, which is normally hidden for CAM but **shown for Ecuador**). If the answer
still does not resolve to a catalog row, mark the lead out of geographic quota (`in_quota_geo = false`,
`nse_region = null`) and let `checkQuotaAvailability` decide the end state (still qualifies only via
the pregnancy/baby exception).
**Rationale**: Guayaquil/Quito split into Norte/Sur/Periferia sub-regions that only Parroquia Urbana
distinguishes; without it the lead cannot be placed. Confirmed against spec assumption.
**Alternatives**: assign a default sub-region (rejected — silently miscategorizes NSE sample);
GPS-only (rejected — not all channels/users share location).

## R4. Finer A/B/C/D/E band

**Decision**: persist `nse_points` (integer 0–500) and derive the 3-band level for `quota_segment`.
Do not store or expose the 5-band letter. **Rationale**: quota config only uses 3 bands; keeping the
raw points allows re-banding later without re-interviewing. Reversible.

## R5. Variable-length per-country survey block & stable `surveyQuestionIndex`

**Decision**: Keep `SURVEY_QUESTIONS` conceptually as **shared prefix** (Q1 name, Q2 country, Q3–Q5
geo, Q6 email, Q7 gender, Q8 age) + **country NSE block** + **shared suffix** (pregnancy, baby,
shopping frequency, shopping categories, contact channel, contact schedule). A new
`resolveSurveyQuestions(country)` in `survey-plan.ts` returns the ordered `SurveyQuestion[]` for a
lead; `SURVEY_QUESTION_COUNT` becomes `resolveSurveyQuestions(country).length`. `surveyQuestionIndex`
stays a 1-based position **into the resolved list for that lead's country**. Country is fixed at Q2,
before any country-specific question, so the list is deterministic from Q3 onward.
**Rationale**: minimal disruption — the prefix/suffix indices are unchanged for CAM (the CAM NSE block
is exactly today's Q9–Q12+Q15, so the resolved CAM list is identical to today's array), so every CAM
advance path and test is unaffected. Ecuador's block is longer (8 questions) so its total count is
higher; all advance paths already compare against `SURVEY_QUESTION_COUNT`, now country-aware.
**Alternatives**: a second parallel `ECUADOR_SURVEY_QUESTIONS` array with its own sender (rejected —
duplicates the prefix/suffix and every advance path; violates Principle III at the 2-country mark);
store answers by field name only and drop the numeric index (rejected — large blast radius across
`flow_states`, correction flow, GPS gate).

## R6. Storage of country-specific scoring answers

**Decision**: add `survey_profiles.scoring_answers_json jsonb` (`{ [variableKey]: optionValue }`) and
`survey_profiles.nse_points smallint`. Ecuador writes its 8 answers there; CAM keeps writing its
existing typed columns (`education_psh`, `cars`, `domestic_help`, `household_size`, `bedrooms`) and
also mirrors them into `scoring_answers_json` for a uniform audit trail. `quota_segment` holds the
NSE level for all countries (unchanged for CAM: "Nivel 1".."Nivel 4"; Ecuador: "AB"/"C"/"D/E").
**Rationale**: Mexico (`015`) adds 6 more variables with zero schema change. Keeps `ScoringFields`
typed for CAM. `nse_points` covers the FR-017 audit requirement.
**Alternatives**: 8 new typed Ecuador columns + 6 more for Mexico (rejected — schema churn per
country); a separate `nse_scoring_events` table (rejected — YAGNI, one row per lead).

## R7. Ecuador phone format

**Decision**: Ecuador landline/mobile = **10 digits** (3-digit area code + 7-digit local). Add a
per-country `validatePhone` to `CountryConfig`; Ecuador strips non-digits, strips a leading `593`
country code or leading `0`, then requires exactly 10 digits. The existing
`resolveWhatsAppPhone` / `isBsuidChannelUserId` guard (memory: BSUID-as-fake-phone bug) is unchanged —
`validatePhone` runs on the *survey-entered* number, not the channel id.
**Rationale**: matches the questionnaire's "Ingresar a 10 dígitos (3) código de área + (7) número".
**Alternatives**: reuse the generic CAM phone check (rejected — different length rules, would accept
malformed EC numbers).

## R8. NSE region catalog build

**Decision**: generate `data/geo/ecuador-nse-regions.json` from the xlsx catalog sheet with the shape
`{ version, source, regions: [{ region, provincia, canton, parroquia, parroquiaUrbana }] }`. Build a
normalized index exactly like `cam-nse-catalog.ts` (`normalizeGeoKey`: strip accents, lowercase,
collapse punctuation). Resolution key: `provincia|canton|parroquiaUrbana` when the cantón is
Guayaquil or Quito (Distrito Metropolitano), else `provincia|canton|parroquia`.
**Rationale**: one proven pattern, reused. Keeps geo logic country-scoped (Principle V).

## R9. Admin quota / leads tooling

**Decision**: `listCatalogCountries()` and `listNseRegionsForCountry()` (used by
`src/app/admin/quotas/page.tsx`) read from a country-aware source: CAM regions from
`cam-nse-regions.json`, Ecuador regions from `ecuador-nse-regions.json`. NSE-level option list per
country comes from `getCountryConfig(country).nseLevels`. Leads dashboard country/region filters are
already string-driven and need no change beyond the catalog returning Ecuador.
**Rationale**: additive; no quota-engine logic change (Principle IV already satisfied).
