---

description: "Task list for 004-scl-cam-scoring-fix"
---

# Tasks: Corrección de la fórmula de scoring SCL-CAM

**Input**: Design documents from `/specs/004-scl-cam-scoring-fix/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [quickstart.md](./quickstart.md)

**Tests**: Included — the spec's Success Criteria are formula-correctness claims, and this repo already has a unit-test file (`tests/unit/scoring.test.ts`) covering this exact module, so rewriting/extending it is part of the fix, not optional.

**Organization**: Tasks are grouped by user story (P1–P4 from spec.md) to enable independent testing of each story. ⚠️ See the **"Deploy-coupling warning"** in Dependencies — two stories that are independently *testable* are **not** independently *deployable* here.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1–US4)
- All file paths are relative to the repo root

## Path Conventions

Single Next.js project — `src/`, `tests/` at repository root (see plan.md § Project Structure). No new directories.

---

## Phase 1: Setup

**Purpose**: Capture the pre-fix baseline so the fix's effect is verifiable.

- [ ] T001 Run `npx vitest run tests/unit/scoring.test.ts tests/unit/qualification-eval.test.ts` and note current pass/fail output for later comparison. No file changes.

---

## Phase 2: Foundational

**Purpose**: N/A for this feature. There is no shared infrastructure (DB migration, auth, routing) separate from the user stories — the corrected formula itself *is* User Story 1's deliverable, and every other story depends directly on specific pieces of it (see Dependencies). Proceed straight to Phase 3.

---

## Phase 3: User Story 1 - Cálculo del score SCL con la fórmula oficial (Priority: P1) 🎯 MVP

**Goal**: `calculateScore()`/`getQuotaSegment()` in `src/lib/scoring/socioeconomic.ts` implement the official Kantar formula and classify into `Nivel 1-4`.

**Independent Test**: `npx vitest run tests/unit/scoring.test.ts` — feed known NiPSH/HACI/AUTO/SD inputs and assert the score and Nivel match a manual calculation of `(45×NiPSH + 18×HACI + 28×AUTO + 9×SD)/100`.

### Implementation for User Story 1

- [X] T002 [US1] In `src/lib/scoring/socioeconomic.ts`, replace `EDUCATION_SCORES` with the official 12-level NiPSH point table (0/0/0/0/250/250/250/400/900/1000/1000/1000) using the exact labels from [data-model.md](./data-model.md) § "Tabla NiPSH".
- [X] T003 [US1] In `src/lib/scoring/socioeconomic.ts`, add a `calculateHaciPoints(householdSize, bedrooms)` helper implementing `HACI = (10×personas)/dormitorios` (→ `99` when `bedrooms` is 0) and mapping to points via the official 4-tier thresholds (≥25→0, >15&<25→250, ≥10&≤15→500, <10→1000). (same file as T002 — sequential)
- [X] T004 [US1] In `src/lib/scoring/socioeconomic.ts`, replace `CAR_SCORES` with the official AUTO point table (`0`→0, `1`→650, `2 o más`→1000). (same file — sequential)
- [X] T005 [US1] In `src/lib/scoring/socioeconomic.ts`, add the SD (servicio doméstico) point mapping (`false`→0, `true`→1000), replacing the current `domesticHelp ? 10 : 0`. (same file — sequential)
- [X] T006 [US1] In `src/lib/scoring/socioeconomic.ts`, rewrite `calculateScore()` to combine the four dimensions via `Math.round((45×NiPSH + 18×HACI + 28×AUTO + 9×SD) / 100)` (rounding rationale: [research.md](./research.md) § R2), removing the old `Math.min(100, ...)` clamp. Depends on T002–T005.
- [X] T007 [US1] In `src/lib/scoring/socioeconomic.ts`, rewrite `getQuotaSegment()` to return `"Nivel 1" | "Nivel 2" | "Nivel 3" | "Nivel 4"` using the official thresholds (`≥540`, `>325 && <540`, `>180 && ≤325`, `≤180`), replacing the México-style `A/B, C+, C, D+, D/E` output. Depends on T006.
- [X] T008 [US1] Rewrite `tests/unit/scoring.test.ts`: assert exact scores for known profiles (see [quickstart.md](./quickstart.md) § 1 worked example), the `HACI=99` no-exclusive-bedrooms case, and correct classification at and around all 4 thresholds (539/540/541, 324/325/326, 179/180/181). Depends on T007.

**Checkpoint**: `npx vitest run tests/unit/scoring.test.ts` is green (14/14). The scoring *engine* is correct, but do not deploy yet in isolation — see the deploy-coupling warning below before shipping T002–T008 alone.

---

## Phase 4: User Story 2 - Opciones completas de nivel educativo del PSH (Priority: P2)

**Goal**: The PSH-education survey question offers the 12 official options, using labels identical to the NiPSH table keys.

**Independent Test**: Trigger the education question in a test conversation and confirm 12 buttons appear, including "No alfabetizado" and "Pos Grado Incompleto".

### Implementation for User Story 2

- [X] T009 [US2] In `src/lib/conversation/survey-questions.ts`, replace the 10-option `educationPsh` button list with the 12 official options, using **labels identical, character-for-character, to the NiPSH table keys added in T002** (this is load-bearing — see warning below). Depends on T002.
- [X] T010 [US2] Add a test to `tests/unit/scoring.test.ts` asserting every `educationPsh` button label exported from `survey-questions.ts` has a matching entry in the NiPSH point table (guards against a silent fallback to 0 points on any future label drift). Depends on T009.

**Checkpoint**: Survey shows 12 education options and every one of them scores correctly (verified by T010, not just visually).

---

## Phase 5: User Story 3 - Nomenclatura de segmentos NSE consistente con CAM (Priority: P3)

**Goal**: Leads of CAM countries persist `quota_segment` as `Nivel 1-4`, never the México-style labels.

**Independent Test**: Complete a test survey end-to-end and check the persisted `leads.quota_segment` value.

### Implementation for User Story 3

- [X] T011 [US3] [P] Update `tests/unit/qualification-eval.test.ts` fixtures: replace `'A/B'`/`'D/E'` literals with `'Nivel 1'`/`'Nivel 4'` (or whichever level is consistent with each fixture's underlying profile — recompute by hand using the T006/T007 formula). Depends on T007.
- [X] T012 [US3] Add a test to `tests/unit/scoring.test.ts` asserting `getQuotaSegment()` never returns `'A/B'`, `'C+'`, `'C'`, `'D+'`, or `'D/E'` for any score in `[0, 1000]`. Depends on T007.

**Checkpoint**: No México-style segment literal remains anywhere in the codebase's scoring/eval paths (`grep -rn "'A/B'\|'C+'\|'D+'\|'D/E'" src tests` returns nothing outside historical docs).

---

## Phase 6: User Story 4 - Opciones de género actualizadas (Priority: P4)

**Goal**: The gender survey question offers `Masculino`/`Femenino` instead of `Hombre`/`Mujer`.

**Independent Test**: Trigger the gender question in a test conversation and confirm the two new labels appear.

### Implementation for User Story 4

- [X] T013 [US4] In `src/lib/conversation/survey-questions.ts`, replace the `Hombre`/`Mujer` gender button options with `Masculino`/`Femenino` (`callback_data` values `gender:Masculino` / `gender:Femenino`). Same file as T009 — do after T009 to avoid merge conflicts if split across owners.

**Checkpoint**: Gender question shows the two new labels; no functional dependency on any other story (gender is not a scoring input).

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Final regression pass and stale-comment cleanup.

- [X] T014 Run `npx vitest run` (full suite) and confirm everything passes, including T008/T010/T011/T012. **Result**: 72/72 actual tests pass (up from the 65 baseline). `npx vitest run` also reports "5 failed" test *files* — these are `tests/e2e/*.spec.ts` Playwright specs that `vitest` cannot execute at all (`test.describe() did not expect to be called here`); confirmed via `git stash` that this happens identically on unmodified `main`, so it's a pre-existing tooling issue unrelated to this feature, not a regression. `npx tsc --noEmit` shows one pre-existing error in `src/lib/eval/persist-eval.ts` (a file untouched by this feature), also confirmed identical on `main`.
- [X] T015 Execute the manual validation steps in [quickstart.md](./quickstart.md) § 3. **Result**: verified programmatically instead of via a live conversation (no running Telegram/WhatsApp webhook + dev DB in this environment) — T010's test asserts all 12 education options and confirmed via `grep` that the gender buttons emit `Masculino`/`Femenino`. The persisted-score/segment check (quickstart step 4) is covered by T008/T011/T012's assertions against `calculateScore`/`getQuotaSegment`, the same functions `phase-1.ts`/`handle-confirm.ts` call before writing to `leads`. A real end-to-end conversational click-through was **not** performed — flagging this so it isn't mistaken for a full UI test pass.
- [X] T016 [P] In `src/lib/scoring/socioeconomic.ts`, remove/update the stale `// Education PSH scoring weights (provided by Treinta — placeholder values)` comment now that the table implements the official Kantar formula, not a placeholder. **Result**: resolved as part of the T002–T007 rewrite (the whole file was rewritten with a comment citing the official source instead).

---

## Dependencies & Execution Order

### ⚠️ Deploy-coupling warning (read before shipping partial work)

**T002 (NiPSH table) and T009 (education button labels) MUST ship in the same deploy/PR**, even though they belong to different priority stories (P1 vs P2). The current 10 button labels (e.g. `"Sec. Incompleta"`, `"Bach. Incompleto"`, `"Posgrado"`) do **not** match any of the 12 official label strings the new table will use. If T002–T008 (US1) ship without T009 (US2), every education answer a real user gives will silently miss the lookup table and fall back to **0 points** (`EDUCATION_SCORES[x] ?? 0`) — a worse regression than the bug being fixed. Treat US1+US2 as one atomic release even though they're tracked as separate stories for testability.

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies.
- **Foundational (Phase 2)**: Empty — see note above.
- **US1 (Phase 3)**: Depends on Setup. T002→T003→T004→T005 (same file, sequential) →T006→T007→T008.
- **US2 (Phase 4)**: T009 depends on T002 only (not T003–T008). T010 depends on T009.
- **US3 (Phase 5)**: T011/T012 depend on T007 only (not T008–T010).
- **US4 (Phase 6)**: T013 has no dependency on any other story's *logic*, but shares a file with T009 — sequence after it.
- **Polish (Phase 7)**: Depends on all prior phases.

### Parallel Opportunities

Limited, because nearly every task touches one of two shared files (`socioeconomic.ts` or `survey-questions.ts`):

- T001 (Setup) can run anytime before T002.
- Once T007 is done, **US3's tasks (T011, T012)** can proceed in parallel with **US2's tasks (T009, T010)** and **US4's task (T013)** — different files, no shared dependency beyond T007.
- T009 (US2) and T013 (US4) both edit `survey-questions.ts` — do **not** run these concurrently across two owners; do them sequentially even though they're logically independent.
- T016 (Polish) is file-independent of T014/T015 and can run in parallel with them.

---

## Parallel Example: After US1 checkpoint (T007 done)

```bash
# These three can proceed in parallel (different files):
Task: "US3 — Update tests/unit/qualification-eval.test.ts fixtures (T011)"
Task: "US3 — Add México-label negative-assertion test (T012)"
Task: "US2 — Replace educationPsh button list in survey-questions.ts (T009)"

# But NOT this one at the same time as T009 (same file):
# Task: "US4 — Replace gender button list in survey-questions.ts (T013)"
```

---

## Implementation Strategy

### MVP scope: US1 + US2 together (not US1 alone)

Because of the deploy-coupling warning above, the smallest safely-shippable increment is **T001–T010** (US1 + US2), not US1 in isolation. That gives a correct, fully scoreable education question. US3 (segment nomenclature) is already delivered as a side effect of T007 by that point — T011/T012 are verification/regression tasks, not new behavior — so in practice **T001–T012 (US1+US2+US3) is the realistic MVP**. US4 (gender labels) is genuinely independent and can ship separately at any time, before or after.

### Incremental Delivery

1. T001 (baseline) → T002–T008 (US1 engine) → **do not deploy yet**.
2. T009–T010 (US2 labels) → now T001–T010 is safe to deploy together → validate via quickstart.md.
3. T011–T012 (US3 verification) → deploy anytime after T007 (can bundle with step 2).
4. T013 (US4 gender) → independent deploy, anytime.
5. T014–T016 (Polish) → final regression + cleanup before closing the feature.

---

## Notes

- [P] tasks = different files, no dependencies — used sparingly here because two files (`socioeconomic.ts`, `survey-questions.ts`) carry almost all the change.
- Commit after each task or logical group (e.g., T002–T008 as one commit, T009–T010 as another).
- Re-run `npx vitest run` after every phase checkpoint, not just at the end.
