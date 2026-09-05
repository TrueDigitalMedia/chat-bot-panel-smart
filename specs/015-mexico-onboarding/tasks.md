---
description: "Task list for Mexico Onboarding implementation"
---

# Tasks: Mexico Onboarding

**Input**: Design documents from `/specs/015-mexico-onboarding/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: INCLUDED — the spec defines per-story Independent Test criteria and measurable outcomes
(SC-002 "≥20 constructed households", SC-003 "≥30 addresses", SC-004 "zero diffs").

**Branch**: `feature/ecuador-mexico`

**Hard dependency**: the country-configuration groundwork from `specs/014-ecuador-onboarding`
Phase 2 (T007–T013: `src/lib/countries/{types,registry,cam}.ts`, `conversation/survey-plan.ts`, the
NSE call-site refactor in `phases/phase-1.ts` + `geo/handle-confirm.ts`, and migration
`0015_ecuador_onboarding.sql` adding `survey_profiles.scoring_answers_json` + `nse_points`) MUST be
merged/landed on the branch first. If Mexico ships before Ecuador, prepend those tasks here (see
research R0) — the phases below assume they exist.

## Path Conventions

Single `src/` web-app tree. Mexico slots into `src/lib/countries/` next to `ecuador.ts`. Data files
under `data/`. Tests under `tests/unit/` and `tests/e2e/`.

**Migration**: none for the socioeconomic-survey / geo / scoring / quota work (reuses `0015` from
feature 014). One migration is needed **only if** the household-member roster spike (T003a) chooses
option B — a minimal member store `0016_mexico_household_members.sql`. If it chooses option A (defer),
015 remains migration-free.

---

## Phase 1: Setup

**Purpose**: Static data files transcribed from `docs/mexico/`.

- [X] T001a Confirm the México source docs are the signed-off final versions before transcription — `docs/mexico/Cuestionario Mexico.docx` (questionnaire wording / answer options / screening list) and `docs/mexico/Muestra Regiones NSE Mexico.xlsx` (region catalog + NSE point tables). Record the version/date and the research-team sign-off in `plan.md`. **Gates T001, T002, T010.** (spec Dependencies)
- [X] T001 [P] Transcribe the Mexico NSE point tables + level cutoffs from `docs/mexico/Muestra Regiones NSE Mexico.xlsx` into `data/scoring/mexico-nse.json` per the shape in `specs/015-mexico-onboarding/data-model.md` §3.1 and the full option→point values in `contracts/mexico-nse-scoring.md` (6 variables; cutoffs ≤99 D/E, 100–140 D+, 141–167 C, 168–201 C+, 202+ AB)
- [X] T002 [P] Build `data/geo/mexico-nse-regions.json` from the catalog sheet of `docs/mexico/Muestra Regiones NSE Mexico.xlsx` (`{ version, source, regions:[{region,regionCode,estrato,estado,municipio}] }`), one row per Estado/Municipio, transcribing every Kantar region present (AMCM, Centro, Sureste, Occidente, Norte, …) verbatim
- [X] T003 [P] Add `scripts/verify-mexico-catalog.ts` asserting there are no duplicate `estado|municipio` keys and every `region` value is non-empty
- [X] T003a **SPIKE — household-member roster (resolves analyze finding U1 / I2)**. The Mexico questionnaire (`docs/mexico/Cuestionario Mexico.docx` §2.3.9–2.3.12) captures per-member data — names of household individuals and, for adult members, relationship / sex / DOB / **personal phone / personal email**. Investigate the current codebase: confirm `ficha_hogar_profiles` is a single respondent-only row (7 questions in `src/lib/conversation/ficha-hogar-questions.ts`, unique on `lead_id`) and that **no per-member data model exists today** for any country. Then decide with the research team and record a one-paragraph decision in `plan.md` (new "Household roster" subsection):
  - **Option A (recommended default) — defer**: a full per-member roster is its own feature ("México ficha del hogar"). 015 does **not** capture per-member phone/email; FR-003's member clause is dropped; 015 stays migration-free; T015 becomes a no-op / removed.
  - **Option B — minimal member store in 015**: add `survey_profiles.household_members jsonb` (array of `{ givenName, familyName, personalPhone?, personalEmail? }`) via migration `0016_mexico_household_members.sql`, plus a minimal "list the other adults" roster step. In scope: name + phone + email only; relationship/sex/DOB stay out (Phase-4, out of scope per spec Assumptions).
  Output: the decision + which of T015 / `0016` / FR-003 wording applies.

**Checkpoint**: Static data committed and self-consistent; roster scope decided (T003a).

---

## Phase 2: Foundational (BLOCKING)

**Purpose**: The Mexico `CountryConfig` skeleton, registry wiring, and country detection — everything
the user stories build on. Small, because feature 014 already built the registry and survey model.

- [X] T004 Verify the feature-014 groundwork is present: `src/lib/countries/types.ts`, `registry.ts`, `cam.ts`, `conversation/survey-plan.ts`, `survey_profiles.scoring_answers_json` + `nse_points` in `schema.ts` and applied to the DB. If absent, STOP and land `specs/014-ecuador-onboarding` Phase 2 first
- [X] T005 Create `src/lib/countries/mexico.ts` exporting `mexicoConfig: CountryConfig` skeleton per `specs/015-mexico-onboarding/data-model.md` §2: `country: 'México'`, `nseLevels: ['AB','C+','C','D+','D/E']`, `geoHierarchy: { stateProvinceLabel: 'estado', municipalityLabel: 'municipio o alcaldía', neighborhoodLabel: 'colonia' }`, with `scoringQuestions`, `computeNse`, `resolveNseRegion`, `validatePhone` stubbed to be filled by later phases
- [X] T006 Register Mexico in `src/lib/countries/registry.ts`: `'México'` → `mexicoConfig` (keep the "Principle V: no country branches outside this file" comment)
- [X] T007 Extend `src/lib/geo/cam-nse-catalog.ts` `canonicalCountry` + the reverse-geocode mapping so `méxico` / `mexico` / `mx` / `estados unidos mexicanos` → `'México'`
- [X] T008 [P] Unit test `tests/unit/country-config-registry.test.ts` (extend) — `getCountryConfig('México') === mexicoConfig`; CAM and Ecuador resolved question lists + scores still unchanged after registering Mexico
- [X] T009 Run the full existing unit + e2e suite; confirm zero diffs in every CAM and Ecuador questionnaire/scoring/quota test (SC-004 gate)
- [X] T009a Run `npm run test:regression` (the CAM golden-master suite built in 014 T004a) and confirm **zero snapshot changes** after registering México. Any diff is a CAM regression caused by the Mexico wiring — fix before proceeding. See `specs/regression/cam-regression-analysis.md`

**Checkpoint**: Mexico is a recognized country; CAM + Ecuador provably unchanged (unit + regression snapshots). User stories can proceed.

---

## Phase 3: User Story 1 — Mexican household completes screening and household profile (P1)

**Goal**: A lead flagged as México is driven by México questionnaire wording through screening and the
Phase-1 household-profile questions (plus per-member phone/email **only if** T003a chose Option B).

**Independent Test**: Run a conversation with Q2 = México; confirm screening, "Origen" options, the
sensitive-industry screener (incl. clothing & footwear), and the respondent-profile capture match
`docs/mexico/Cuestionario Mexico.docx`; a parallel CAM/Ecuador conversation is unchanged.

- [X] T010 [P] [US1] Add the Mexico NSE `SurveyQuestion` objects (educationHoh, fullBathrooms, vehicleCount, homeInternet, workers14Plus, bedrooms, householdSize position, codigoPostal) to `src/lib/countries/mexico.ts` as `mexicoConfig.scoringQuestions`, wording + button options verbatim from the questionnaire (education option list is "último año aprobado por el jefe o jefa de hogar")
- [X] T011 [P] [US1] Add the `'México'` button to `SHARED_PREFIX` Q2 in `src/lib/conversation/survey-questions.ts` (`country:México`)
- [X] T012 [US1] Extend the screening / conflict-of-interest step to use the Mexico sensitive-industry list (agencia de publicidad; empresa de investigación de mercado; radio/periódico/TV; propietario de industria o comercio de alimentos, bebidas, higiene personal, limpieza del hogar, ropa o zapatos) via `CountryConfig.screeningIndustries` (the field added in feature 014 T020) — no inline country branch
- [X] T013 [US1] Implement `mexicoConfig.validatePhone` per `contracts/mexico-geo-catalog.md` (strip `52` / trailing-`1` / leading `0`, require 10 digits) and apply it at the phone-capture step for México leads
- [X] T014 [US1] Add the Mexico `codigoPostal` free-text step to `mexicoConfig.scoringQuestions` after Colonia ("¿Cuál es tu código postal?", validate 5 digits); persist to `scoring_answers_json.codigoPostal`; `computeNse` ignores it
- [X] T015 [US1] **REMOVED (T003a Option A — defer roster to a separate feature).** ~~Per-member phone/email — gated on T003a.** If T003a chose **Option A (defer)**: this task is removed; add a line to `plan.md` and spec Assumptions confirming per-member contact data is deferred to a separate "México ficha del hogar" feature; **nothing else to do**. If T003a chose **Option B**: apply migration `0016_mexico_household_members.sql` (add `survey_profiles.household_members jsonb`) to the live Neon branch in the same change as the `schema.ts` edit; add the minimal roster step (name the other adults) + a per-member phone/email capture when `country === 'México'`; persist to `household_members`; include the array in the `panel-smart` / TDM sync payload. Third-party-data handling per T046 / FR-022 / FR-024
- [X] T016 [P] [US1] Update `src/lib/ai/extract-survey-fields.ts` with Mexico answer-option hints for the 6 NSE variables + screening options + CP (allowlist-validated on capture)
- [X] T017 [P] [US1] E2E test `tests/e2e/mexico-onboarding.spec.ts` (part 1) — Q2=México → screening + Phase-1 household-profile prompts/options equal the México questionnaire; sensitive-industry (e.g. "zapatos") → `not_qualified`; CAM/Ecuador conversations in parallel unaffected. If T003a chose Option B, also assert the roster step captures per-member phone/email.

**Checkpoint**: A México lead is recognized and interviewed with México content through the Phase-1 profile (and the minimal roster, if T003a chose Option B).

---

## Phase 4: User Story 2 — Mexico address and geography resolve to an NSE region (P1)

**Goal**: Estado/Municipio (or GPS) resolves to one Kantar region; off-catalog → out of geo quota.

**Independent Test**: Known Mexico addresses (an AMCM municipio, a Centro municipio, a Sureste
municipio, an off-catalog address) each resolve to the expected region or are flagged out of quota.

- [X] T018 [P] [US2] Implement `src/lib/geo/mexico-nse-catalog.ts` `lookupMexicoNseRegion(estado, municipio)` per `contracts/mexico-geo-catalog.md` — normalized index on `estado|municipio`, returns `{ region }` (+ `estrato`/`regionCode` metadata) or `null`; reuse `normalizeGeoKey` from `cam-nse-catalog.ts`
- [X] T019 [US2] Set `mexicoConfig.resolveNseRegion` to delegate to `lookupMexicoNseRegion` (quota keys on `region` only — research R3); apply the CP fallback: if municipio unresolved but a valid 5-digit CP was captured, re-ask municipio once, then `null`
- [X] T020 [US2] Route `src/lib/conversation/gps-capture.ts` + `src/lib/geo/handle-confirm.ts` region resolution through `getCountryConfig(country).resolveNseRegion(...)` for México (already generic after feature 014 T027 — verify, no new branch); set `in_quota_geo = nseRegion != null`
- [X] T021 [US2] Emit the `geo_resolve` structured log for México (`lead_id, country, estado, municipio, codigo_postal, matched_region|null`)
- [X] T022 [P] [US2] Unit test `tests/unit/mexico-nse-catalog.test.ts` — the vector table in `contracts/mexico-geo-catalog.md` plus an off-catalog address → `null`; assemble a ≥30-address fixture across AMCM/Centro/one other region toward SC-003
- [X] T023 [US2] E2E test `tests/e2e/mexico-onboarding.spec.ts` (part 2) — `Distrito Federal / Iztapalapa` → `nse_region = 'AMCM'`, `in_quota_geo = true`; off-catalog municipio → `in_quota_geo = false`, `nse_region = null`

**Checkpoint**: Mexico geography produces a Kantar region (or a clean out-of-quota flag).

---

## Phase 5: User Story 3 — Mexico NSE score and level computed from the AMAI-style instrument (P1)

**Goal**: The 6 NSE answers produce a point total and a 5-band level ("AB"/"C+"/"C"/"D+"/"D/E") used
as the quota segment.

**Independent Test**: Feed the workbook worked example (105 → "D+") + boundary cases; total and level
match the transcribed tables.

- [X] T024 [P] [US3] Implement `src/lib/scoring/mexico-nse.ts` `computeMexicoNse(answers)` per `contracts/mexico-nse-scoring.md` — data-driven from `data/scoring/mexico-nse.json`; sum of 6 contributions; missing → 0; totals <100 floor to "D/E" (research R5); returns `{ points, level, contributions }`
- [X] T025 [US3] Set `mexicoConfig.computeNse` to adapt `computeMexicoNse` output to `NseResult` (already has `nseLevels` from T005)
- [X] T026 [US3] Confirm the survey-completion block (refactored in feature 014 T013) writes, for México: 6 raw answers + `codigoPostal` to `survey_profiles.scoring_answers_json`, `nse_points` = total, `bedrooms` mirrored to its typed column, `quota_segment` = level, `score` = null; emit `nse_score` log with per-variable `contributions`
- [X] T027 [P] [US3] Unit test `tests/unit/mexico-nse.test.ts` — the 10-row vector table in `contracts/mexico-nse-scoring.md` (workbook 105 → D+; each cutoff boundary 99/100, 140/141, 167/168, 201/202; all-missing → 0/"D/E") plus ≥20 constructed households toward SC-002
- [X] T028 [US3] E2E test `tests/e2e/mexico-onboarding.spec.ts` (part 3) — survey shows the 6 Mexico NSE questions (not CAM/Ecuador); at completion `leads.nse_points` set, `leads.quota_segment ∈ {AB,C+,C,D+,D/E}`, `leads.score` null; worked-example inputs → `nse_points = 105`, `quota_segment = 'D+'`

**Checkpoint**: Mexico leads carry an auditable NSE points total and a level.

---

## Phase 6: User Story 4 — Mexico lead reaches a quota decision and panel registration (P2)

**Goal**: Mexico region + level feed the existing quota engine; accepted leads route to registration +
sync tagged México.

**Independent Test**: With Mexico quota targets + region caps loaded, run accepted / quota-exhausted /
pregnancy-or-baby-exception leads end to end; verify decision, lead status, and the country tag +
CP on the sync record.

- [X] T029 [P] [US4] Add a Mexico quota-config seed/fixture (`src/lib/db/seed/mexico-quota-example.ts` or a test fixture) with `quota_targets` rows (`country='México'`, nse ∈ {AB,C+,C,D+,D/E}, plus edad/integrantes) and `quota_region_caps` rows per Kantar region
- [X] T030 [US4] Add `tests/unit/quota-mexico.test.ts` covering `checkQuotaAvailability` for `country='México'`: NSE-dimension match, region-cap block, pregnancy/baby-under-36-months exception attribution (no engine code change expected)
- [X] T031 [US4] Ensure `panel-smart` / TDM sync snapshot includes `country`, `nse_region`, `nse_points`, NSE `level`, and `codigoPostal` for México leads (extend the synced-answers builder in `src/lib/panel-smart/` / `src/lib/tdm-registration/` if needed)
- [X] T032 [US4] E2E test `tests/e2e/mexico-onboarding.spec.ts` (part 4) — open target → `lead_status='link_sent'` + Phase 2 starts; cap reached → `quota_exhausted`; `has_baby_under_3=true` + cap reached → `link_sent`; accepted lead's sync record shows `country='México'` + region + level + CP

**Checkpoint**: Full Mexico funnel from message to registration works.

---

## Phase 7: User Story 5 — Mexico in admin quota and leads tooling (P3)

**Goal**: Admin can configure Mexico quota targets/region caps and filter leads by México.

**Independent Test**: In `/admin/quotas` select México → Kantar regions + {AB,C+,C,D+,D/E} offered;
create a target + cap; `/admin/leads` filters by México and its regions.

- [X] T033 [US5] Update `listCatalogCountries` / `listNseRegionsForCountry` (used by `src/app/admin/quotas/page.tsx`) to include México + its Kantar regions from `data/geo/mexico-nse-regions.json` (same code path extended in feature 014 T040)
- [X] T034 [US5] Confirm the admin NSE-dimension option list (sourced from `getCountryConfig(country).nseLevels` per feature 014 T041) shows AB / C+ / C / D+ / D/E for México in `new-quota-target-row.tsx` + `quota-filters-form.tsx`
- [X] T035 [P] [US5] Confirm `src/app/admin/leads` country + region filters render México (add to any hardcoded country list found)
- [X] T036 [P] [US5] E2E/integration test `tests/e2e/admin-mexico-quotas.spec.ts` — select México in the quota screen, region dropdown = Kantar regions, NSE = {AB,C+,C,D+,D/E}, create + persist a target and a region cap; leads filter by México

**Checkpoint**: Research team can operate Mexico quotas unaided (SC-005).

---

## Phase 8: Polish & Cross-Cutting

- [ ] T037 [P] Update `specs/015-mexico-onboarding/quickstart.md` commands if any script names differ from the repo
- [ ] T038 [P] Run `npx vitest run` + `npx playwright test` + `npm run test:regression` full suites; confirm SC-004 zero-diff (unit + CAM golden-master snapshots, CAM + Ecuador) and all new Mexico tests green
- [ ] T039 [P] Add a Mexico row to `docs/countries.md` (created in feature 014 T046) — AMAI 6-variable instrument, Kantar regions, "México" canonical name
- [ ] T040 Verify the `nse_score` / `geo_resolve` / `quota_check` logs for a México run against `quickstart.md` §6 (Principle II gate)
- [ ] T041 Self-review against constitution v1.2.0 Constitution Check in `plan.md` — confirm Mexico added zero country-name branches outside `getCountryConfig`

---

## Phase 9: Meta / WhatsApp Policy & Data-Protection Compliance (RELEASE GATE)

**Purpose**: Close the gaps folded in from `checklists/meta-compliance.md` (spec FR-018–FR-028,
SC-007). Every task here is **blocking for Mexico go-live**, not for merging code. Owned jointly by
the feature reviewer and a named compliance/legal owner.

- [ ] T042 Enumerate every WhatsApp template the Mexico flow sends; record the list + per-template "needs Mexico-localized variant?" decision in `plan.md` (new "Compliance" subsection). Explicitly mark which compliance items are shared with feature 014 vs. per-country. (FR-018, FR-028)
- [ ] T043 For each template needing a Mexico variant: submit to Meta, track to approved status (category unchanged, `es`/`es_MX` language tag), record the Content SID; confirm the pending `registration_instructions` resubmission and all CAM/Ecuador templates are unaffected. **Blocks go-live.** (FR-018)
- [ ] T044 Compile the final Mexico session-message strings from `docs/mexico/Cuestionario Mexico.docx` (question wording, answer-option lists, the broadened conflict-of-interest list incl. clothing/footwear) and run a documented review against the WhatsApp Business Messaging Policy + WhatsApp Commerce Policy; record reviewer + sign-off; confirm no incentive/prize wording reclassifies a template category. (FR-019)
- [ ] T045 Legal review of the aviso de privacidad / consent text for Mexico LFPDPPP adequacy — required aviso content, option to limit use/disclosure, ARCO rights; treat pregnancy + disability as "datos personales sensibles" needing explicit consent. Localize/amend and record legal approval. **Blocks go-live.** (FR-020, FR-021)
- [ ] T046 Third-party PII sign-off for the roster contact data — **only if T003a chose Option B**; if Option A, this task just records "member contact data deferred to a separate feature; no third-party PII collected in 015" and is done. Under Option B: with the compliance owner, confirm the lawful basis + disclosure for collecting other household members' phone/email, retention/deletion for panelist + member data, and that member phone/email is captured as **structured input** (per T003a Option B — `household_members jsonb`), not LLM free-text. Update spec + `plan.md`. (FR-022, FR-024)
- [ ] T046a **WhatsApp regression harness** (resolves analyze finding U2; shared with `014-ecuador-onboarding` T053a). Verify the WhatsApp-channel support in `tests/regression/` (`@/lib/whatsapp/send` capture mock, `channel: 'whatsapp'` in the journey runner, `pending_wa_choices` button-fallback, CAM WhatsApp baseline journeys) is present from 014 T053a. If 015 lands first, build it here per 014 T053a's spec. Prerequisite for T047.
- [ ] T047 Add explicit spec/plan text asserting re-engagement cadence, single-attempt cap, outbound-without-reply ceiling, opt-out/STOP handling, and 24h-window behaviour are unchanged for México with no new outside-24h message type. Using the WhatsApp harness (T046a), add a **WhatsApp-channel** México journey to `tests/regression/` and assert the numbered-choice / button-fallback path and WhatsApp message-length / button-count limits for the long education list; **if T003a chose Option B**, also assert the multi-member roster prompts. (FR-023, FR-025)
- [ ] T048 Update `plan.md` Constitution Principle I assessment to name the Mexico free-text fields sent to the LLM (street address, Código Postal, roster free-text incl. member email), document the PII-to-external-LLM justification (incl. third-party data), and confirm sanitization / prompt-injection mitigations apply unchanged. (FR-024)
- [ ] T049 Document + validate Meta account-standing assumptions for the Mexico rollout: phone-number quality tier, per-number messaging limits, phased ramp-up plan. Add to `plan.md`. (FR-027)
- [ ] T050 Create the "México launch readiness" gate: a single checklist aggregating T043 (templates approved) + T044 (content review signed) + T045 (legal sign-off) + T046 (third-party-data resolved, if applicable) + T046a/T047 (WhatsApp regression green), each with a named approver; wire as the explicit go/no-go before enabling México on WhatsApp. (FR-026, SC-007)
- [ ] T051 Work `specs/015-mexico-onboarding/checklists/meta-compliance.md` (CHK001–CHK039) to completion with the compliance owner; for any item still failing, add a covering FR/task or record an accepted-risk note with sign-off.

**Checkpoint**: Mexico may be enabled on WhatsApp only when the T050 readiness gate is 100% green.

---

## Dependencies & Execution Order

- **Feature 014 Phase 2** → hard prerequisite (T004 gate-checks it).
- **Phase 1 (Setup)** → T001a (docs-final check) gates T001/T002; then T001/T002/T003 in parallel.
  **T003a (roster spike) must be decided before T015 and before T046**; it can run in parallel with
  T001–T003 (research task, no code).
- **Phase 2 (Foundational)** → depends on Phase 1 + feature 014. BLOCKS all user stories. T005→T006→T007 sequential; T008 after T006; T009 last.
- **US1 (Phase 3)** → depends on Phase 2. Shares `src/lib/countries/mexico.ts` with US2/US3. **T015 is
  gated on T003a** (no-op under Option A; adds migration `0016` + a roster step under Option B).
- **US2 (Phase 4)** → depends on Phase 2. Independent of US1/US3 (separate files).
- **US3 (Phase 5)** → depends on Phase 2. Independent of US1/US2 (separate files).
- **US4 (Phase 6)** → depends on US2 + US3 (needs region + level). Independent of US1.
- **US5 (Phase 7)** → depends on Phase 2 + T002 (catalog) + T005 (nseLevels). Independent of US4.
- **Polish (Phase 8)** → after all targeted stories.
- **Compliance (Phase 9)** → gates México **go-live**, not code merge. Start T042/T044/T048/T049 once
  the México strings are final (after US1). T043 (Meta) and T045 (legal) have external turnaround —
  start early. **T046a (WhatsApp harness) is infra — do it right after T009a**, not at Phase 9 time.
  T050 is last; T051 runs alongside.

## Parallel Opportunities

- Phase 1: T001, T002, T003, T003a together (after T001a; T003a is a research task).
- After Phase 2, **US1 + US2 + US3 can be built in parallel** — only overlap is `src/lib/countries/mexico.ts` (`scoringQuestions` in T010, `resolveNseRegion` in T019, `computeNse` in T025 are separate members; land T010 first or coordinate).
- Within US1: T010, T011, T016, T017 parallel. Within US2: T018, T022 parallel. Within US3: T024, T027 parallel.

## Implementation Strategy

- **MVP = Phase 1 + Phase 2 + US1 + US2 + US3** (all P1) — a complete Mexico interview producing a
  Kantar region + NSE level + quota decision via the existing engine. US4 adds seed data + sync-tag
  assertions; US5 is admin convenience.
- Mexico is intentionally small: it reuses feature 014's registry, survey model, the `0015` columns,
  NSE call-sites, observability logs, and admin-catalog wiring. Almost every task is config + data +
  tests. The only possible new migration is `0016` — and only if the T003a roster spike picks Option B.
- Ship incrementally after feature 014 lands: Phase 2 (proves CAM + Ecuador unchanged) → US1 → US2 →
  US3 → US4 → US5.
- **Code-complete ≠ launched.** Phase 9 (Meta/WhatsApp policy + LFPDPPP, incl. the roster third-party
  PII question) is a separate release gate: the T050 "Mexico launch readiness" checklist must be 100%
  green before Mexico is enabled on WhatsApp. Start the external-turnaround items (T043 Meta, T045
  legal) as early as the final strings allow.
