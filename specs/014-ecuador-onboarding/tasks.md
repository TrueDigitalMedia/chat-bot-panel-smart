---
description: "Task list for Ecuador Onboarding implementation"
---

# Tasks: Ecuador Onboarding

**Input**: Design documents from `/specs/014-ecuador-onboarding/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: INCLUDED — the spec defines per-story Independent Test criteria and measurable outcomes
(SC-002 "≥20 constructed households", SC-003 "≥30 addresses", SC-004 "zero diffs") that require
automated tests.

**Branch**: `feature/ecuador-mexico`

## Path Conventions

Single `src/` web-app tree. New namespace `src/lib/countries/`. Data files under `data/`. Tests under
`tests/unit/` and `tests/e2e/`.

---

## Phase 1: Setup

**Purpose**: Data files and directory scaffolding shared by all stories.

- [ ] T001 Create `src/lib/countries/` directory and add `src/lib/countries/types.ts` with the `NseResult`, `GeoHierarchy`, and `CountryConfig` interfaces exactly as in `specs/014-ecuador-onboarding/contracts/country-config.md`
- [ ] T001a Confirm the Ecuador source docs are the signed-off final versions before transcription — `docs/ecuador/Cuestionario Ecuador.docx` (questionnaire wording / answer options / screening list) and `docs/ecuador/Muestra Regiones NSE Ecuador.xlsx` (region catalog + NSE point tables). Record the version/date and the research-team sign-off in `plan.md`. **Gates T002, T003, T017.** (spec Dependencies)
- [ ] T002 [P] Transcribe the Ecuador NSE point tables + level cutoffs from `docs/ecuador/Muestra Regiones NSE Ecuador.xlsx` into `data/scoring/ecuador-nse.json` per the shape in `specs/014-ecuador-onboarding/data-model.md` §3.1 and the full option→point values in `contracts/ecuador-nse-scoring.md`
- [ ] T003 [P] Build `data/geo/ecuador-nse-regions.json` from the catalog sheet of `docs/ecuador/Muestra Regiones NSE Ecuador.xlsx` (`{ version, source, regions:[{region,provincia,canton,parroquia,parroquiaUrbana}] }`), one row per parroquia/parroquia-urbana, per `data-model.md` §3.2
- [X] T004 [P] Add a build/verification script `scripts/verify-ecuador-catalog.ts` that asserts every `region` value in `ecuador-nse-regions.json` is in the known 12-region set and there are no duplicate `provincia|canton|parroquiaUrbana` keys
- [ ] T004a **CAM regression baseline** — on a `src/`-clean commit at the branch point (no 014/015 code): flesh out journeys C2–C11 in `tests/regression/cam-journeys.ts`, switch `cam-golden-master.test.ts` to `CAM_JOURNEYS_ALL`, run `npm run test:regression:update` against a migrated test DB, and commit `tests/regression/__snapshots__/`. Land this commit on `feature/ecuador-mexico` first. See `specs/regression/cam-regression-analysis.md`
  - **Partial progress, not the pre-014 baseline this task calls for**: C1 and C4 (of C1–C11) were debugged into a real, passing baseline — fixed `resetLeadTables` FK ordering, missing inbound-message logging (was permanently tripping the outbound-ceiling breaker), a too-low test timeout for real Neon round-trips, and 3 content bugs in the C1 fixture itself (missing `reengagement_consent`/phone-capture turns, `gps:manual` positioned after `country:Panamá` instead of before, seeded quota region name mismatch) — see `tests/regression/__snapshots__/cam-golden-master.test.ts.snap`. Confirmed **zero diff** across the 014 registry/survey-plan/NSE refactor (T016a). But this snapshot was captured with 014 code already present on this branch, not on a clean pre-014 commit — it cannot itself prove 014 didn't change CAM behavior relative to `main`, only that later 014-branch changes didn't. C2–C11 are still stubs. Properly closing this task needs: `git stash` (or a worktree on `main`) → run `test:regression:update` there → commit that snapshot as the real pre-014 baseline → reapply 014's changes → re-run `test:regression` to diff against it.

**Checkpoint**: Static data committed and self-consistent; CAM behavior snapshot pinned.

---

## Phase 2: Foundational (BLOCKING — no user story can start until this is done)

**Purpose**: The country-configuration registry, the variable-length survey model, the DB migration,
and the NSE call-site refactor. This is the groundwork feature `015-mexico-onboarding` also depends on.

- [ ] T005 Add `survey_profiles.scoring_answers_json jsonb` and `survey_profiles.nse_points smallint` to `src/lib/db/schema.ts`
- [ ] T006 Create migration `src/lib/db/migrations/0015_ecuador_onboarding.sql` (`ALTER TABLE survey_profiles ADD COLUMN scoring_answers_json jsonb; ADD COLUMN nse_points smallint;`) and apply it to the live Neon dev branch in this same change (per memory: migrations must be applied, not just committed)
- [ ] T007 Implement `src/lib/countries/cam.ts` exporting `camConfig: CountryConfig` that wraps existing code unchanged: `computeNse` → `calculateScore` + `getQuotaSegment`; `resolveNseRegion` → `lookupNseRegion`; `scoringQuestions` → the exact `SurveyQuestion` objects currently at Q9–Q12 and Q15 of `SURVEY_QUESTIONS`; `validatePhone` → the current generic survey phone check; `geoHierarchy` carries the Guatemala/Costa Rica wording currently special-cased in `send-survey-question.ts`
- [ ] T008 Implement `src/lib/countries/registry.ts` exporting `getCountryConfig(country)` — the ONLY country-name switch in the codebase: 7 CAM/RD names + unknown/null → `camConfig`; `'Ecuador'` → `ecuadorConfig` (import lazily or via a map). Add a `// Principle V: do not add country branches outside this file` comment
- [ ] T009 Refactor `src/lib/conversation/survey-questions.ts` into `SHARED_PREFIX` (Q1 fullName, Q2 country, Q3 stateProvince, Q4 municipality, Q5 neighborhood, Q6 email, Q7 gender, Q8 age) and `SHARED_SUFFIX` (isPregnant, hasBabyUnder3, shoppingFrequency, shoppingCategories, contactChannel, contactSchedule) arrays; keep the current CAM NSE `SurveyQuestion` objects exported for `camConfig`
- [ ] T010 Create `src/lib/conversation/survey-plan.ts` exporting `resolveSurveyQuestions(country)` = `[...SHARED_PREFIX, ...getCountryConfig(country).scoringQuestions, ...SHARED_SUFFIX]` re-indexed 1..N, and `surveyQuestionCount(country)`. Replace all imports of `SURVEY_QUESTION_COUNT` / `SURVEY_QUESTIONS` in `send-survey-question.ts`, `phases/phase-1.ts`, `geo/handle-confirm.ts`, `geo/gps-capture.ts`, `conversation/correction-fields.ts` with the country-aware calls
- [ ] T011 Update `src/lib/conversation/send-survey-question.ts` to pull the question list from `resolveSurveyQuestions(profile.country)` and derive Q3/Q4/Q5 wording from `getCountryConfig(country).geoHierarchy` (retiring the inline Guatemala/Costa Rica string checks), keeping the "Q5 hidden when `neighborhoodLabel == null`" send-time backstop. **Note**: feature `016-web-chat-country-rooms` T006/T007 later replaces this backstop (and its 3 copies elsewhere) with one shared `nextQuestionToSend` helper — keep this copy minimal and easy to delete; a `TODO(016)` comment is appropriate
- [ ] T012 Make `src/lib/conversation/correction-fields.ts` `questionIndexForField` country-aware (field + country → position in `resolveSurveyQuestions(country)`)
- [ ] T013 Refactor the survey-completion scoring block in `src/lib/conversation/phases/phase-1.ts` AND `src/lib/geo/handle-confirm.ts` to call `const cfg = getCountryConfig(profile.country); const { points, level } = cfg.computeNse(answers)` then write `leads.nse_points`, `leads.quota_segment = level`, `leads.score` (CAM only), and pass `segment: level` to `checkQuotaAvailability` (behavior identical for CAM)
- [X] T014 [P] Unit test `tests/unit/country-config-registry.test.ts` — for each CAM/RD name, `resolveSurveyQuestions(name)` deep-equals today's `SURVEY_QUESTIONS` (016 does not change the list — it adds a send-time skip helper, so this assertion stays valid), and `camConfig.computeNse` matches golden `calculateScore`/`getQuotaSegment` values; `getCountryConfig(undefined)` returns `camConfig`
- [X] T015 [P] Unit test `tests/unit/survey-plan.test.ts` — resolved order + count for a CAM country (unchanged) and for `'Ecuador'` (8 NSE questions between prefix and suffix)
- [X] T016 Run the full existing unit + e2e suite and confirm zero diffs in every CAM questionnaire/scoring/quota test (SC-004 gate)
- [X] T016a Run `npm run test:regression` (the CAM golden-master suite from T004a) and confirm **zero snapshot changes** after the registry / `survey-plan.ts` / NSE call-site refactor. Any diff is a CAM regression — fix it before proceeding

**Checkpoint**: Registry live, CAM path provably unchanged (unit + regression snapshots), DB ready. User stories can now proceed.

---

## Phase 3: User Story 1 — Ecuadorian household completes screening and household profile (P1)

**Goal**: A lead flagged as Ecuador is driven by Ecuador questionnaire wording through screening and
the household-profile questions.

**Independent Test**: Run a conversation with Q2 = Ecuador; confirm screening, "Origen" options, the
sensitive-industry screener, and the "Ama de Casa" capture match `docs/ecuador/Cuestionario Ecuador.docx`;
a parallel CAM conversation is unchanged.

- [ ] T017 [P] [US1] Add the 8 Ecuador NSE `SurveyQuestion` objects (healthInsurancePsh, monthlyIncome, dwellingFinishes, floorMaterial, vehicleCount, occupationHead, occupationAma, educationPsh, internetAccess — plus householdSize position) to `src/lib/countries/ecuador.ts` as `ecuadorConfig.scoringQuestions`, wording + button options verbatim from the questionnaire
- [ ] T018 [P] [US1] Add the `'Ecuador'` button to `SHARED_PREFIX` Q2 in `src/lib/conversation/survey-questions.ts` (`country:Ecuador`)
- [ ] T019 [US1] Set `ecuadorConfig.geoHierarchy` = `{ stateProvinceLabel: 'provincia', municipalityLabel: 'cantón', neighborhoodLabel: 'parroquia' }` so Q3–Q5 render Ecuador wording and Q5 (parroquia) is shown
- [ ] T020 [US1] Extend the screening / conflict-of-interest step (sensitive industries) to use the Ecuador list (agencia de publicidad; empresa de investigación de mercado; radio/periódico/TV; propietario de industria o comercio de alimentos, higiene personal o limpieza) when `country === 'Ecuador'`, via config not an inline branch — add `screeningIndustries` to `CountryConfig` and route the screening question text/options through it
- [X] T021 [US1] Wire `ecuadorConfig.validatePhone` (strip `593`/leading `0`, require 10 digits) and apply it at the phone-capture step for Ecuador leads
- [X] T022 [P] [US1] ~~Update `src/lib/ai/extract-survey-fields.ts` with Ecuador answer-option hints for the 8 NSE variables + screening options~~ — N/A as implemented: every Ecuador NSE/screening question is `inputType: 'button'` (`ecuador.ts`), captured via `interpretButtonAnswer` (builds its option list dynamically from the question's own `buttons`, not `FIELD_HINTS`), never via `extractField`/`FIELD_SCHEMAS` (a fixed CAM free-text field union that doesn't include these field names). No hint would ever be read.
- [X] T023 [P] [US1] E2E test `tests/e2e/ecuador-onboarding.spec.ts` (part 1) — Q2=Ecuador → screening + household-profile prompts/options equal the Ecuador questionnaire; sensitive-industry answer → `not_qualified`; CAM conversation in parallel unaffected

**Checkpoint**: An Ecuador lead is recognized and interviewed with Ecuador content through the profile block.

---

## Phase 4: User Story 2 — Ecuador address and geography resolve to an NSE region (P1)

**Goal**: Provincia/Cantón/Parroquia (or GPS) resolves to one Ecuador Región; off-catalog → out of geo
quota.

**Independent Test**: Known Ecuador addresses (Guayaquil + Quito parroquias urbanas, a Sierra cantón,
an off-catalog address) each resolve to the expected Región or are flagged out of geographic quota.

- [ ] T024 [P] [US2] Implement `src/lib/geo/ecuador-nse-catalog.ts` `lookupEcuadorNseRegion(provincia, canton, parroquia)` per `contracts/ecuador-geo-catalog.md` — normalized index, Guayaquil/Quito keyed on parroquiaUrbana, else parroquia, `provincia|canton` fallback for single-region cantones, `null` on miss; reuse `normalizeGeoKey` from `cam-nse-catalog.ts`
- [ ] T025 [US2] Set `ecuadorConfig.resolveNseRegion` to delegate to `lookupEcuadorNseRegion`
- [ ] T026 [US2] Update `src/lib/geo/cam-nse-catalog.ts` `canonicalCountry` (and the reverse-geocode mapping) so `ecuador` / `ec` → `'Ecuador'`
- [ ] T027 [US2] Route `src/lib/conversation/gps-capture.ts` and `src/lib/geo/handle-confirm.ts` region resolution through `getCountryConfig(country).resolveNseRegion(...)` instead of the direct `lookupNseRegion` import; set `in_quota_geo = nseRegion != null`
- [ ] T028 [US2] Emit the `geo_resolve` structured log (`lead_id, country, provincia, canton, parroquia, matched_region|null, source`) at every resolution point
- [X] T029 [P] [US2] Unit test `tests/unit/ecuador-nse-catalog.test.ts` — the vector table in `contracts/ecuador-geo-catalog.md` plus an off-catalog address → `null`; assemble a ≥30-address fixture toward SC-003
- [X] T030 [US2] E2E test `tests/e2e/ecuador-onboarding.spec.ts` (part 2) — `Guayas / Guayaquil / Tarqui` → `nse_region = 'Guayaquil Norte'`, `in_quota_geo = true`; an off-catalog parroquia → `in_quota_geo = false`, `nse_region = null`

**Checkpoint**: Ecuador geography produces a Región (or a clean out-of-quota flag).

---

## Phase 5: User Story 3 — Ecuador NSE score and level computed from the Ecuador instrument (P1)

**Goal**: The 8 NSE answers produce a point total and a 3-band level ("AB"/"C"/"D/E") used as the
quota segment.

**Independent Test**: Feed the workbook worked example + boundary cases; point total and level match
the transcribed tables.

- [ ] T031 [P] [US3] Implement `src/lib/scoring/ecuador-nse.ts` `computeEcuadorNse(answers)` per `contracts/ecuador-nse-scoring.md` — data-driven from `data/scoring/ecuador-nse.json`; occupation = `max(points(occupationHead), points(occupationAma))`; missing → 0; returns `{ points, level, contributions }`
- [ ] T032 [US3] Set `ecuadorConfig.computeNse` to adapt `computeEcuadorNse` output to `NseResult` and `ecuadorConfig.nseLevels = ['AB','C','D/E']`
- [ ] T033 [US3] In the survey-completion block (already refactored in T013), for Ecuador write the 8 raw answers to `survey_profiles.scoring_answers_json`, `nse_points` = total, `quota_segment` = level, `score` = null; emit the `nse_score` structured log with per-variable `contributions`
- [X] T034 [P] [US3] Unit test `tests/unit/ecuador-nse.test.ts` — the vector table in `contracts/ecuador-nse-scoring.md` (workbook household = 58 → C; boundaries 50/51, 75/76; all-missing → 0/"D/E"; occupation-max case) plus ≥20 constructed households toward SC-002
- [X] T035 [US3] E2E test `tests/e2e/ecuador-onboarding.spec.ts` (part 3) — survey shows the 8 Ecuador NSE questions; at completion `leads.nse_points` set, `leads.quota_segment ∈ {AB,C,D/E}`, `leads.score` null

**Checkpoint**: Ecuador leads carry an auditable NSE points total and a level.

---

## Phase 6: User Story 4 — Ecuador lead reaches a quota decision and panel registration (P2)

**Goal**: Ecuador NSE region + level feed the existing quota engine; accepted leads route to
registration + sync tagged Ecuador.

**Independent Test**: With Ecuador quota targets + region caps loaded, run accepted / quota-exhausted
/ pregnancy-exception leads end to end; verify decision, lead status, and the country tag on the sync
record.

- [ ] T036 [P] [US4] Add an Ecuador quota-config seed/fixture (`src/lib/db/seed/ecuador-quota-example.ts` or a test fixture) with `quota_targets` rows (`country='Ecuador'`, nse ∈ {AB,C,D/E}, plus edad/integrantes) and `quota_region_caps` rows for the 12 regions
- [ ] T037 [US4] Verify `checkQuotaAvailability` needs no code change — add `tests/unit/quota-ecuador.test.ts` covering: NSE-dimension match, region-cap block, and pregnancy/baby exception attribution for `country='Ecuador'`
- [ ] T038 [US4] Ensure `panel-smart` / TDM sync snapshot includes `country`, `nse_region`, `nse_points`, and NSE `level` for Ecuador leads (extend the synced-answers builder in `src/lib/panel-smart/` / `src/lib/tdm-registration/` if the level/points aren't already in the diff set)
- [ ] T039 [US4] E2E test `tests/e2e/ecuador-onboarding.spec.ts` (part 4) — open target → `lead_status='link_sent'` + Phase 2 starts; cap reached → `quota_exhausted`; `is_pregnant=true` + cap reached → `link_sent`; accepted lead's sync record shows `country='Ecuador'` + region + level

**Checkpoint**: Full Ecuador funnel from message to registration works.

---

## Phase 7: User Story 5 — Ecuador in admin quota and leads tooling (P3)

**Goal**: Admin can configure Ecuador quota targets/region caps and filter leads by Ecuador.

**Independent Test**: In `/admin/quotas` select Ecuador → Ecuador regions + NSE levels offered; create
a target + cap; `/admin/leads` filters by Ecuador and its regions.

- [ ] T040 [US5] Update `src/lib/geo/cam-nse-catalog.ts` (or wherever `listCatalogCountries` / `listNseRegionsForCountry` live, used by `src/app/admin/quotas/page.tsx`) to include Ecuador countries + regions from `data/geo/ecuador-nse-regions.json`
- [ ] T041 [US5] Source the admin NSE-dimension option list per country from `getCountryConfig(country).nseLevels` so Ecuador shows AB / C / D/E in `src/app/admin/quotas/new-quota-target-row.tsx` and `quota-filters-form.tsx`
- [ ] T042 [P] [US5] Confirm `src/app/admin/leads` country + region filters render Ecuador (string-driven; add Ecuador to any hardcoded country list found)
- [ ] T043 [P] [US5] E2E/integration test `tests/e2e/admin-ecuador-quotas.spec.ts` — select Ecuador in the quota screen, region dropdown = 12 Ecuador regions, NSE = {AB,C,D/E}, create + persist a target and a region cap; leads filter by Ecuador

**Checkpoint**: Research team can operate Ecuador quotas unaided (SC-005).

---

## Phase 8: Polish & Cross-Cutting

- [ ] T044 [P] Update `quickstart.md` commands if any script names differ from the repo (`npm run db:migrate` / `db:check`)
- [ ] T045 [P] Run `npx vitest run` + `npx playwright test` + `npm run test:regression` full suites; confirm SC-004 zero-diff (unit + CAM golden-master snapshots) and all new tests green
- [ ] T046 [P] Add a short `docs/countries.md` (or section in an existing doc) describing the `src/lib/countries/` registry and the "country config, not country branches" rule, referencing constitution Principle V
- [ ] T047 Verify the `nse_score` / `geo_resolve` / `quota_check` logs for an Ecuador run against `quickstart.md` §6 (Principle II gate)
- [ ] T048 Self-review against constitution v1.2.0 Constitution Check in `plan.md` — confirm the only country-name branch is `getCountryConfig`

---

## Phase 9: Meta / WhatsApp Policy & Data-Protection Compliance (RELEASE GATE)

**Purpose**: Close the gaps folded in from `checklists/meta-compliance.md` (spec FR-018–FR-027,
SC-007). Every task here is **blocking for Ecuador go-live**, not for merging code. Owned jointly by
the feature reviewer and a named compliance/legal owner.

- [ ] T049 Enumerate every WhatsApp template the Ecuador flow sends (registration instructions, re-engagement, code delivery, others). Record the list + per-template "needs Ecuador-localized variant?" decision in `plan.md` (new "Compliance" subsection). (FR-018)
- [ ] T050 For each template needing an Ecuador variant: submit to Meta, track to approved status (category unchanged, `es`/`es_EC` language tag), and record the Content SID in the `whatsapp_templates` store. Confirm the pending `registration_instructions` resubmission and all CAM templates are unaffected. **Blocks go-live.** (FR-018)
- [ ] T051 Compile the final Ecuador session-message strings from `docs/ecuador/Cuestionario Ecuador.docx` (all question wording, answer-option lists, the expanded conflict-of-interest message) and run a documented review against the WhatsApp Business Messaging Policy + WhatsApp Commerce Policy; record reviewer + sign-off date; confirm no incentive/prize wording reclassifies a template category. (FR-019)
- [ ] T052 Legal review of the consent / privacy-notice (T&C) text for Ecuador LOPDP adequacy — lawful basis, stated purpose, data-subject rights; identify income + health-insurance + pregnancy + disability answers as sensitive and state their handling. Localize/amend the copy if required and record legal approval. **Blocks go-live.** (FR-020, FR-021)
- [ ] T053 Add the Ecuador retention/deletion requirement to the spec (or an explicit deferral with named owner + rationale). (FR-022)
- [ ] T053a **Extend the CAM regression harness for the WhatsApp channel** (resolves analyze finding U2; shared with `015-mexico-onboarding` T046a). The harness built in T004a (`tests/regression/`, per `specs/regression/cam-regression-analysis.md`) drives Telegram inbounds only. Add: a `@/lib/whatsapp/send` capture mock (alongside the existing telegram one in `cam-outbox.ts`), support for `channel: 'whatsapp'` in `cam-harness.ts`'s journey runner (including the numbered-choice / `pending_wa_choices` button-fallback path), and 1–2 **CAM** WhatsApp golden-master journeys (one full-qualify, one button-fallback). Capture their baseline snapshots on the pre-014 commit (extend T004a) so post-014/015 diffs are caught. This is the prerequisite for T054 and 015 T047.
- [ ] T054 Add explicit spec/plan text asserting re-engagement cadence, single-attempt cap, outbound-without-reply ceiling, opt-out/STOP handling, and 24h-window behaviour are unchanged for Ecuador and that no new outside-24h message type is added. Using the WhatsApp harness from T053a, add a **WhatsApp-channel** Ecuador journey to `tests/regression/` and assert the numbered-choice / button-fallback path plus WhatsApp message-length / button-count limits for the long occupation & education lists. (FR-023, FR-025)
- [ ] T055 Update `plan.md` Constitution Principle I assessment to name the Ecuador free-text fields sent to the LLM (`full address`, any income/education free-text), document the PII-to-external-LLM justification, and confirm existing sanitization / prompt-injection mitigations apply unchanged. (FR-024)
- [ ] T056 Document + validate Meta account-standing assumptions for the Ecuador rollout: phone-number quality tier, per-number messaging limits, and a phased ramp-up plan. Add to `plan.md`. (FR-027)
- [ ] T057 Create the "Ecuador launch readiness" gate: a single checklist aggregating T050 (templates approved) + T051 (content review signed) + T052 (legal sign-off) + T053a/T054 (WhatsApp regression green), each with a named approver; wire it as the explicit go/no-go before enabling Ecuador on WhatsApp. (FR-026, SC-007)
- [ ] T058 Work `specs/014-ecuador-onboarding/checklists/meta-compliance.md` (CHK001–CHK037) to completion with the compliance owner; for any item still failing, either add a covering FR/task or record an accepted-risk note with sign-off.

**Checkpoint**: Ecuador may be enabled on WhatsApp only when the T057 readiness gate is 100% green.

---

## Dependencies & Execution Order

- **Phase 1 (Setup)** → T001a (docs-final check) gates T002/T003; then T002/T003/T004 in parallel.
- **Phase 2 (Foundational)** → depends on Phase 1. BLOCKS all user stories. T005→T006 sequential; T007→T008 sequential; T009→T010→T011/T012 sequential; T013 after T008+T010; T014/T015 after T013; T016 last.
- **US1 (Phase 3)** → depends on Phase 2. Independent of US2/US3 except they share `ecuador.ts`.
- **US2 (Phase 4)** → depends on Phase 2. Independent of US1/US3.
- **US3 (Phase 5)** → depends on Phase 2. Independent of US1/US2.
- **US4 (Phase 6)** → depends on US2 + US3 (needs region + level). Independent of US1.
- **US5 (Phase 7)** → depends on Phase 2 + T003 (catalog) + T032 (nseLevels). Independent of US4.
- **Polish (Phase 8)** → after all targeted stories.
- **Compliance (Phase 9)** → gates Ecuador **go-live**, not code merge. T049/T051/T055/T056 can start
  as soon as the Ecuador strings are final (after US1). T050 (Meta approval) and T052 (legal) have
  external turnaround — start them early. **T053a (WhatsApp harness) is infra — do it right after
  T004a / T016a, not at Phase 9 time**; it only sits here because T054 consumes it. T057 is last;
  T058 runs alongside.

## Parallel Opportunities

- Phase 1: T002, T003, T004 together (after T001a).
- Phase 2: T014 + T015 together (after T013).
- Once Phase 2 is done, **US1, US2, and US3 can be built in parallel by three people** (only overlap is `src/lib/countries/ecuador.ts` — coordinate or land T017/T019/T020 first, then T024/T025 and T031/T032 are separate files).
- Within US1: T017, T018, T022, T023 parallel. Within US2: T024, T029 parallel. Within US3: T031, T034 parallel.

## Implementation Strategy

- **MVP = Phase 1 + Phase 2 + US1 + US2 + US3** (all P1). This delivers a complete Ecuador interview
  that produces a region + NSE level and a quota decision via the existing engine. US4 formalizes the
  seed data + sync-tag assertions; US5 is admin convenience.
- Land Phase 2 first and keep it on the shared `feature/ecuador-mexico` branch — `015-mexico-onboarding`
  reuses T007–T013 verbatim.
- Ship incrementally: Phase 2 (proves CAM unchanged) → US1 → US2 → US3 → US4 → US5.
- **Code-complete ≠ launched.** Phase 9 (Meta/WhatsApp policy + LOPDP) is a separate release gate:
  the T057 "Ecuador launch readiness" checklist must be 100% green — templates approved, content
  review signed, legal sign-off, WhatsApp regression green — before Ecuador is enabled on WhatsApp.
  Start the external-turnaround items (T050 Meta, T052 legal) as early as the final strings allow.
