# Phase 0 Research: Mexico Onboarding

All values transcribed from `docs/mexico/Cuestionario Mexico.docx` and
`docs/mexico/Muestra Regiones NSE Mexico.xlsx` (sheets: catalog, `TABLA DE PUNTOS`, sample).

## R0. Sequencing vs. feature 014 (Ecuador)

**Decision**: Mexico depends on the country-configuration groundwork from `014-ecuador-onboarding`:
`src/lib/countries/{types,registry,cam,...}.ts`, `conversation/survey-plan.ts`, the NSE call-site
refactor in `phases/phase-1.ts` + `geo/handle-confirm.ts`, and migration `0015_ecuador_onboarding.sql`
(the `survey_profiles.scoring_answers_json` + `nse_points` columns). Implement 014 first (or its
groundwork commits first, on the shared `feature/ecuador-mexico` branch); then 015 is additive.
**Rationale**: building the registry twice is waste; Principle V wants one registry, not two.
**Alternatives**: ship 015 first and move the groundwork here (viable — the task list would absorb the
registry + migration tasks from 014's plan); ship them as one combined feature (rejected — two
distinct questionnaires/instruments, cleaner to review and test separately).

## R1. Mexico NSE point tables (AMAI-style, 6 variables)

**Decision**: Mexico NSE = additive sum of 6 variable point values, banded to a level. Store as a
static JSON data file `data/scoring/mexico-nse.json`, same pattern as Ecuador.

Point tables (option → points):

| Variable | Options → points |
|----------|------------------|
| Escolaridad del jefe/jefa de hogar (último año aprobado) | Sin instrucción escolar 0 · Alfabetizado sin escuela formal 0 · Primaria incompleta 6 · Primaria completa 11 · Secundaria incompleta 12 · Secundaria completa 18 · Prepa/Bachillerato/Carrera incompleta 23 · Prepa/Bachillerato/Carrera completa 27 · Licenciatura incompleta 36 · Licenciatura completa 59 · Posgrado incompleto 85 · Posgrado completo / Diplomado / Maestría / Doctorado 85 |
| Baños completos con regadera y W.C. | 0 → 0 · 1 → 24 · 2 o más → 47 |
| Automóviles o camionetas en el hogar | 0 → 0 · 1 → 22 · 2 o más → 43 |
| Internet fijo en la vivienda (excluye conexión móvil) | No tiene → 0 · Sí tiene → 32 |
| Personas de 14+ años que trabajaron el último mes | 0 → 0 · 1 → 15 · 2 → 31 · 3 → 46 · 4 o más → 61 |
| Cuartos que se usan para dormir (sin pasillos ni baños) | 0 → 0 · 1 → 8 · 2 → 16 · 3 → 24 · 4 o más → 32 |

**Level cutoffs (the collapsed "NSE MEXICO" level used for quota)**:
`6–99 → "D/E"`, `100–140 → "D+"`, `141–167 → "C"`, `168–201 → "C+"`, `202–300 → "AB"`.

**Worked example** (workbook sample row): Primaria completa 11 + 1 baño 24 + 0 autos 0 + Sin internet
0 + 3 personas trabajaron 46 + 3 cuartos 24 = **105 → "D+"**. Clean, no data gap (unlike Ecuador's
sample). `tests/unit/mexico-nse.test.ts` asserts this plus each cutoff boundary
(99/100, 140/141, 167/168, 201/202).

**Rationale**: matches the workbook's collapsed `NSE / Puntaje Nueva` column; spec US5 offers exactly
"AB", "C+", "C", "D+", "D/E" in the admin NSE dimension.

## R2. Education variable

**Decision**: score the **highest completed schooling of the jefe o jefa de hogar** — a single answer,
no max-of-two. **Rationale**: the Mexico questionnaire wording is explicitly "Pensando en el jefe o
jefa de hogar" (one person), unlike Ecuador's "jefe y/o ama". **Alternatives**: reuse Ecuador's
max(head, ama) logic (rejected — wrong instrument, would overscore).

## R3. Kantar region set & resolution key

**Decision**: `data/geo/mexico-nse-regions.json` rows = `{ region (Kantar), regionCode, estrato,
estado, municipio }`. Resolution key = normalized `estado | municipio`. `estrato` and `regionCode`
are carried on the row for reference/reporting but the **quota decision keys on the Kantar `region`
name only** (spec assumption confirmed). Kantar regions seen in the workbook: `AMCM`, `Centro`,
`Sureste`, plus the remaining Kantar regions present (`Occidente`/Guadalajara, `Norte`, `Bajío`, …) —
the full set is whatever the catalog sheet contains; transcribe verbatim.
**Rationale**: one region name per quota cell keeps `quota_targets` legible; Estrato is a finer cut
the research team can add later as an `edad`/`integrantes`-style dimension if needed.
**Alternatives**: key on `region + estrato` composite (rejected — YAGNI, not requested, doubles the
quota grid); key on Municipio directly (rejected — hundreds of cells, sample is designed at region
level).

## R4. Finer AMAI 7-level table

**Decision**: persist `nse_points` (integer) and derive the 5-band collapsed level for
`quota_segment`. Do not store or expose the AMAI A/B/C+/C/D+/D/E letter. **Rationale**: quota config
uses the 5-band set; raw points allow re-banding without re-interviewing. Reversible.

## R5. Scoring total below the workbook minimum

**Decision**: the workbook's lowest band starts at 6, but an all-lowest-answers household sums to 0
(and missing answers also contribute 0). Any total `< 100` → **"D/E"** (i.e. treat the `6` as the
lowest *observed* value, not a validity floor). A lead is never marked "incomplete" solely because its
score is low. **Rationale**: consistent with current CAM behavior (missing scoring inputs tolerated;
`getQuotaSegment` always returns a band); AMAI's own floor is "E". Confirmed against spec assumption.
**Alternatives**: mark totals < 6 as "incomplete" and re-ask (rejected — a genuinely poor household
would be blocked; extra turns, no value).

## R6. Canonical country name, detection, Código Postal, Colonia

**Decision**:
- Canonical survey/DB country name = **"México"** (accented, matching the existing catalog style —
  `"Panamá"`, `"Rep. Dominicana"`). `canonicalCountry()` maps `méxico`, `mexico`, `mx`,
  `estados unidos mexicanos` → `"México"`.
- Survey Q2 gains a **"México"** button. Geo labels: Q3 = "estado", Q4 = "municipio o alcaldía",
  Q5 = "colonia" (shown for Mexico).
- **Código Postal** is captured as a dedicated free-text step in the Mexico geo block (5 digits) and
  stored in `scoring_answers_json` / a reused profile field — it is **not** a scoring input; it is a
  geo aid and a downstream-sync field.
- **CP → Municipio fallback**: if Municipio can't be resolved but a valid 5-digit CP is given, planning
  may add a CP→Municipio lookup later; for now the default is **ask the municipio question once, then
  out of geographic quota** (spec assumption confirmed).
**Rationale**: matches the Mexico questionnaire's address block (Calle/No. ext/int, Complemento,
Colonia, Estado, Municipio, Código Postal). **Alternatives**: unaccented "Mexico" (rejected —
inconsistent with catalog); CP as primary geo key (rejected — needs a CP dataset not in `docs/mexico/`).

## R7. Mexico phone format

**Decision**: Mexico landline/mobile = **10 digits**. `mexicoConfig.validatePhone`: strip non-digits;
drop a leading `52` country code, a leading `1` after `52` (legacy mobile prefix), or a single leading
`0`; require exactly 10 digits; `normalized` = the 10-digit string. The `resolveWhatsAppPhone` /
`isBsuidChannelUserId` channel-id guard (memory: BSUID-as-fake-phone bug) is unchanged — `validatePhone`
runs on the survey-entered number.
**Rationale**: standard Mexican national number length. **Alternatives**: reuse the generic CAM check
(rejected — would accept 8-digit inputs).

## R8. Per-member personal phone / email in the Mexico roster

**Superseded by the T003a spike** (analyze finding U1). The original assumption here — "store in the
existing per-member roster structure; the roster is already a country-agnostic sub-flow" — is **false**:
codebase inspection shows the current ficha-del-hogar flow (`src/lib/conversation/ficha-hogar-questions.ts`,
`ficha_hogar_profiles`, unique on `lead_id`) is a **single respondent-only record with 7 questions and
no per-member array**. No per-member household data model exists for any country.

**Decision**: the Mexico questionnaire (`2.3.9`–`2.3.12`) captures per-member names + phone + email.
Because there is no roster to extend, tasks **T003a** decides:

- **Option A (recommended default) — defer**: a per-member roster is its own feature ("México ficha
  del hogar"). 015 does not capture per-member contact data; stays migration-free.
- **Option B — minimal member store in 015**: `survey_profiles.household_members jsonb` (array of
  `{ givenName, familyName, personalPhone?, personalEmail? }`) via migration `0016`, plus a minimal
  "list the other adults" step. Name + phone + email only; relationship/sex/DOB stay out of scope.

**Not in scope either way**: relationship to head of household, per-member sex/date of birth,
permanent-disability status, unlimited-data-package — these remain Phase-4 ficha-del-hogar content,
unchanged and country-agnostic.
**Alternatives considered**: extend `ficha_hogar_profiles` (rejected — it's one row/lead, no member
concept); add member fields to `survey_profiles` as scalars (rejected — per-member, not per-household).
