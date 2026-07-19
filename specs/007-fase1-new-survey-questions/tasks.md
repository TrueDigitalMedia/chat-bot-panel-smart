---

description: "Task list for 007-fase1-new-survey-questions"
---

# Tasks: Nuevas preguntas de Fase 1 (opt-in, edad, embarazo, bebé)

**Input**: Design documents from `/specs/007-fase1-new-survey-questions/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [quickstart.md](./quickstart.md)

**Tests**: One e2e smoke test for the opt-in gate (constitution: lead-capture path). One unit test guarding the two parallel arrays (`SURVEY_QUESTIONS`/`SURVEY_FIELDS`) stay in sync — the exact class of bug research.md R4 exists to prevent.

**Organization**: Tasks are grouped by user story (P1–P2 from spec.md). ⚠️ **`SURVEY_FIELDS` (`types/lead.ts`) and `SURVEY_QUESTIONS` (`survey-questions.ts`) are ordered arrays that US2/US3/US4 each append to** — position in the array determines the question's index (research.md R1), so these three stories are **not** parallelizable against each other for those two specific edits, even though they're independent everywhere else. US1 (opt-in) doesn't touch either array at all and is fully independent of US2/US3/US4.

## Format: `[ID] [P?] [Story] Description`

## Path Conventions

Single Next.js project — `src/`, `tests/` at repository root (plan.md § Project Structure).

---

## Phase 1: Setup

- [ ] T001 Confirm no new dependencies needed (AI extraction reuses the existing `extractField`/Zod pipeline). No file changes.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The migration and the question-count fix are needed before US2/US3/US4 can safely add a 17th+ question. **US1 (opt-in) only needs T002/T003** (its own migration column) — it does not need T004/T005.

- [X] T002 Write `src/lib/db/migrations/0011_fase1_new_questions.sql`: `leads.opt_in_accepted` with the two-step backfill from research.md R2 (`ADD COLUMN ... DEFAULT true` for existing rows, then `ALTER COLUMN ... SET DEFAULT false` for new rows) + `survey_profiles.age` (smallint), `is_pregnant` (boolean), `has_baby_under_3` (boolean).
- [X] T003 Update `src/lib/db/schema.ts`: add `optInAccepted` to the `leads` table and `age`/`isPregnant`/`hasBabyUnder3` to `surveyProfiles`, matching T002. Depends on T002.
- [X] T004 [P] In `src/lib/conversation/survey-questions.ts`, add `export const SURVEY_QUESTION_COUNT = SURVEY_QUESTIONS.length` (currently 16; will read 19 automatically once US2/US3/US4 append their entries — no need to update this constant itself later).
- [X] T005 Replace the hardcoded `16` boundary with `SURVEY_QUESTION_COUNT` in all 7 call sites (research.md R4): `src/lib/conversation/phases/phase-1.ts` (2×), `src/lib/geo/handle-confirm.ts` (2×), `src/lib/conversation/faq-handler.ts` (1×), `src/lib/conversation/correction.ts` (2×). Depends on T004. Verified via `grep -n "16"` on all 4 files — zero remaining hits.

**Checkpoint**: Schema and the shared question-count constant exist. `npx tsc --noEmit` clean. US1 can start now; US2/US3/US4 also need T004/T005 done (not just T002/T003).

---

## Phase 3: User Story 1 - Pregunta de opt-in inicial (Priority: P1) 🎯 MVP

**Goal**: A new opt-in gate before D1, mirroring D1's exact shape.

**Independent Test**: Start a new conversation and confirm the opt-in question is the first message; decline it and confirm `not_qualified` without seeing D1.

### Implementation for User Story 1

- [X] T006 [US1] In `src/types/lead.ts`, add `optInAccepted: boolean` to the `Lead` interface. Depends on T003 (schema must have the column first, though this is just a type — practically sequence after T003 for consistency).
- [X] T007 [US1] In `src/lib/conversation/phases/phase-1.ts`, add a `sendOptIn()` helper (same shape as `sendD1`/`sendD2`/`sendD3`) with the text and buttons from research.md R5 ("Inscribirme" / "No"), and a new gate block **before** the existing `if (!lead.d1Accepted)` block: `if (!lead.optInAccepted)` → handle `optin:accept` (set `optInAccepted=true`, call `sendD1`), `optin:decline` (→ `transitionLead(..., 'not_qualified', 'opt_in_decline', ...)`, `sendText(EXIT_A)`), else re-send the opt-in question. Depends on T006.
- [X] T008 [US1] [P] In `src/lib/conversation/flow-router.ts`, add `'optin:'` to `BUTTON_PREFIXES`. Also added `'isPregnant:'`/`'hasBabyUnder3:'` in the same edit (originally T018/T022) since the list was already open — noted here so those later tasks aren't duplicated.
- [X] T009 [US1] [P] In `src/lib/conversation/faq-handler.ts`, add `!query.startsWith('optin:')` to the `shouldCheckFaq` exclusion list (defensive — callback strings are already under the 15-char length filter, but matches the explicit style already used for `d1:`/`d2:`/`d3:`).
- [X] T010 [US1] Write `tests/e2e/phase-1-optin.spec.ts` (same `postWebhook` helper pattern as `phase-1-disqualify.spec.ts`): a fresh conversation's first bot message is the opt-in question; `optin:decline` → lead status `not_qualified`; `optin:accept` → advances to D1. Written but **not executed** (needs live dev server + DB — same constraint as specs 005/006).

**Checkpoint**: Opt-in gate works end-to-end (code-complete). Fully shippable alone — no dependency on US2/US3/US4. `npx tsc --noEmit` clean; `npx vitest run tests/unit` → 98/98 passing, zero regressions.

---

## Phase 4: User Story 2 - Captura de edad (Priority: P2)

**Goal**: Age question after gender, stored, no effect on score.

**Independent Test**: Complete a survey with a valid age; confirm it's stored and the SCL score matches an identical profile with a different age.

### Implementation for User Story 2

- [X] T011 [US2] In `src/types/lead.ts`: add `age: number | null` to `SurveyProfile` (added alongside `isPregnant`/`hasBabyUnder3` in one interface edit — interfaces aren't order-sensitive, only the `SURVEY_FIELDS` array is); append `'age'` to `SURVEY_FIELDS` (**first** of the three new appends — must land before T015/T019); append `'age'` to `FREE_TEXT_FIELDS`. Depends on T003.
- [X] T012 [US2] [P] In `src/lib/ai/extract-survey-fields.ts`, add `age: z.object({ value: z.number().int().min(13).max(100).nullable() })` to `FIELD_SCHEMAS` (range per spec Assumptions).
- [X] T013 [US2] In `src/lib/conversation/survey-questions.ts`, append the `age` entry to `SURVEY_QUESTIONS` (index 17, free_text, "¿Cuántos años cumplidos tienes?") — matches T011's position in `SURVEY_FIELDS`. Depends on T011.
- [X] T014 [US2] [P] In `src/lib/conversation/correction-fields.ts`, add `age: 'Edad'` to `FIELD_LABELS` and `edad`/`años` to `FIELD_ALIASES`. **Note**: `FIELD_LABELS: Record<SurveyFieldName, string>` made this non-optional — `tsc` failed with "Property 'age' is missing" the moment T011 landed, confirming the existing type already guards against forgetting this registration.

**Checkpoint**: Age question asked, stored, correctable. `npx tsc --noEmit` clean; `npx vitest run tests/unit` → 98/98 passing (score-unaffected regression check deferred to T024, since `tests/unit/scoring.test.ts` doesn't need any new test — `ScoringFields` structurally excludes the new field).

---

## Phase 5: User Story 3 - Pregunta de embarazo (Priority: P2)

**Goal**: Sí/No pregnancy question, stored, no effect on score.

**Independent Test**: Complete a survey, confirm the Sí/No answer is stored and doesn't change the score.

### Implementation for User Story 3

- [X] T015 [US3] In `src/types/lead.ts`: add `isPregnant: boolean | null` to `SurveyProfile` (done in the combined interface edit under T011); append `'isPregnant'` to `SURVEY_FIELDS` **immediately after `'age'`**; append `'isPregnant'` to `BUTTON_FIELDS`.
- [X] T016 [US3] In `src/lib/conversation/survey-questions.ts`, append the `isPregnant` entry (index 18, button, Sí/No, `isPregnant:true`/`isPregnant:false`, "¿Te encuentras actualmente embarazada?") — after T013's `age` entry.
- [X] T017 [US3] [P] In `src/lib/conversation/correction-fields.ts`, add `isPregnant: 'Embarazo'` to `FIELD_LABELS` and `embarazo`/`embarazada` to `FIELD_ALIASES`.
- [X] T018 [US3] [P] In `src/lib/conversation/flow-router.ts`, add `'isPregnant:'` to `BUTTON_PREFIXES`. **Already done under T008** (batched with `optin:`/`hasBabyUnder3:` in one edit).

**Checkpoint**: Pregnancy question asked, stored, correctable. `npx tsc --noEmit` clean; `npx vitest run tests/unit` → 98/98 passing.

---

## Phase 6: User Story 4 - Pregunta de bebé menor de 3 años (Priority: P2)

**Goal**: Sí/No baby<3 question, stored, no effect on score.

**Independent Test**: Complete a survey, confirm the Sí/No answer is stored and doesn't change the score.

### Implementation for User Story 4

- [X] T019 [US4] In `src/types/lead.ts`: add `hasBabyUnder3: boolean | null` to `SurveyProfile` (done under T011); append `'hasBabyUnder3'` to `SURVEY_FIELDS` **immediately after `'isPregnant'`**; append `'hasBabyUnder3'` to `BUTTON_FIELDS`.
- [X] T020 [US4] In `src/lib/conversation/survey-questions.ts`, append the `hasBabyUnder3` entry (index 19, button, Sí/No, "¿Vive usted con un bebé menor de 3 años?") — after T016's `isPregnant` entry.
- [X] T021 [US4] [P] In `src/lib/conversation/correction-fields.ts`, add `hasBabyUnder3: 'Bebé menor de 3 años'` to `FIELD_LABELS` and `bebe`/`bebé` to `FIELD_ALIASES`.
- [X] T022 [US4] [P] In `src/lib/conversation/flow-router.ts`, add `'hasBabyUnder3:'` to `BUTTON_PREFIXES`. **Already done under T008.**

**Checkpoint**: All 19 questions (16 original + 3 new) registered, in order. `npx tsc --noEmit` clean; `npx vitest run tests/unit` → 98/98 passing, zero regressions.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T023 Write `tests/unit/survey-question-count.test.ts`: `SURVEY_QUESTIONS.length === SURVEY_FIELDS.length === SURVEY_QUESTION_COUNT` (=19), the last 3 entries of both arrays are `age`, `isPregnant`, `hasBabyUnder3` in order, every entry's `fieldName`/`index` matches its array position, and the original 16 kept their exact positions. 4 tests, all passing.
- [X] T024 Run `npx vitest run` and `npx tsc --noEmit` (full regression). **Result**: 116/116 actual tests pass (was 98 before this feature, zero regressions). `vitest` reports "7 failed" test *files* — the same 6 pre-existing Playwright-under-vitest files (specs 004/005/006) plus this feature's own `phase-1-optin.spec.ts` joining that same known category, not a new kind of failure. `tsc --noEmit` shows only the pre-existing unrelated `persist-eval.ts` error. `tests/unit/scoring.test.ts`/`qualification-eval.test.ts` untouched and still green (SC-004).
- [ ] T025 Execute [quickstart.md](./quickstart.md) §§ 1–5 against a local dev server + DB with migration 0011 applied. **Not run** — same constraint as specs 005/006: requires touching the real Neon DB, needs explicit go-ahead before running.
- [X] T026 [P] Update `docs/WIKI.md` §11 and §5.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (T001)**: none.
- **Foundational (T002–T005)**: T002→T003 (migration before schema) and T004→T005 (constant before its usages) are each sequential pairs. **US1 only needs T002/T003.** US2/US3/US4 need all four.
- **US1 (T006–T010)**: needs T002/T003 only — independently deployable, no relation to US2/US3/US4.
- **US2 (T011–T014)**: needs T004/T005 (Foundational). T011 is the **first** of three sequential `SURVEY_FIELDS`/`SURVEY_QUESTIONS` appends — nothing in US3/US4 can start their array edits before T011/T013 land.
- **US3 (T015–T018)**: T015/T016 depend on T011/T013 (US2) landing first — same two ordered arrays. T017/T018 (labels, button prefix) have no such ordering constraint and could technically run anytime after Foundational, but touch the same files as US2/US4's equivalents — sequence them together in practice.
- **US4 (T019–T022)**: T019/T020 depend on T015/T016 (US3) landing first, for the same reason.
- **Polish (T023–T026)**: after all stories.

### Parallel Opportunities

Limited for the same structural reason as spec 006 (a shared ordered resource), here it's two parallel arrays instead of a shared page file:

- T004 (Foundational) has no dependency on T002/T003 — different file, could start immediately, parallel with T002→T003.
- T008/T009 (US1, different files from T007) are parallel with each other and with T007 itself in principle, though T007 defines the callback names T008/T009 reference — sequence T007 first in practice.
- T012 (US2, `extract-survey-fields.ts`), T014 (US2), T017 (US3), T018 (US3), T021 (US4), T022 (US4) — all Record/Set additions with no ordering constraint — **could** be done in parallel by different people once their story's ordered-array task (T011/T015/T019) has landed, since they touch different files or non-order-sensitive parts of shared files.
- The one hard serialization: **T011 → T013 → T015 → T016 → T019 → T020 must happen in exactly this order** — this is the real bottleneck of the feature, not story boundaries.

---

## Parallel Example: Within Foundational

```bash
# Different files, no shared dependency:
Task: "Write migration 0011 (T002)"
Task: "Add SURVEY_QUESTION_COUNT constant (T004)"
```

---

## Implementation Strategy

### MVP scope: US1 alone

The opt-in gate is fully independent of the three field-registration stories — ship T001–T010 first, exactly like spec 004/005/006's US1-as-MVP pattern.

### Incremental Delivery

1. T001–T005 (Setup + Foundational) → migration + question-count constant exist.
2. T006–T010 (US1) → opt-in gate live. **Deploy independently, anytime.**
3. T011–T014 (US2) → age question live (requires T004/T005 already done).
4. T015–T018 (US3) → pregnancy question live (requires T011/T013 already done — cannot ship before US2's array edits land, even if US3 is otherwise "done" first).
5. T019–T022 (US4) → baby<3 question live (requires T015/T016 already done — same constraint relative to US3).
6. T023–T026 (Polish).

### Parallel Team Strategy

Two people can work simultaneously: one on US1 (fully independent), one starting Foundational T002-T005 then moving through US2→US3→US4 in strict order (the array-append chain can't be split across people without one blocking the other at each step).

---

## Notes

- [P] tasks touch different files (or non-order-sensitive parts of shared files) with no unmet dependency.
- The real dependency chain to respect: T011→T013→T015→T016→T019→T020 (the two ordered arrays), not the nominal US2/US3/US4 story boundaries.
- Commit per phase checkpoint.
