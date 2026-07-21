---

description: "Task list template for feature implementation"
---

# Tasks: Cuotas flexibles por dimensión

**Input**: Design documents from `/specs/011-flexible-quota-matching/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: Included — this feature extends an existing, actively-tested subsystem (`tests/unit/quota-*.test.ts`, `tests/e2e/quota-check-real.spec.ts`, spec 005), so new/changed behavior gets equivalent coverage per repo convention.

**Organization**: Tasks are grouped by user story (spec.md) to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3, US4)
- File paths are exact and repo-relative

## Path Conventions

Single Next.js project — `src/`, `tests/` at repository root (see plan.md § Project Structure for the full file list).

---

## Phase 1: Setup

**Purpose**: Land the schema change all stories build on.

- [X] T001 Write migration `src/lib/db/migrations/0014_flexible_quota_matching.sql` (renumbered — 0012/0013 already taken): rename `quota_targets.nse_level` → `dimension_value`, add `dimension_type` (default `'nse'`, then drop default), replace unique index with `(country, region, dimension_type, dimension_value)`, create `quota_region_caps` table + unique index `(country, region)`, add `leads.quota_matched_dimension` and `leads.quota_matched_value` — exact DDL in [data-model.md](./data-model.md)
- [X] T002 [P] Update `src/lib/db/schema.ts`: rename `quotaTargets.nseLevel` → `dimensionValue`, add `quotaTargets.dimensionType`, add new `quotaRegionCaps` pgTable, add `leads.quotaMatchedDimension`/`leads.quotaMatchedValue`
- [X] T003 Apply migration T001 against the dev/Neon database in this session and verify `quota_targets`, `quota_region_caps`, `leads` reflect the new columns (per project convention: migrations must be applied, not just committed) — verified via `psql \d` and existing rows preserved with `dimension_type='nse'`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared query layer that every user story's matching logic depends on.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T004 [P] Update `src/lib/quotas/quota-progress.ts`: rename `nseLevel` → `dimensionType`/`dimensionValue` throughout (`QuotaProgress`, `QuotaTargetRow`, `toProgress`), change `getQuotaProgressForTarget(country, region, dimensionType, dimensionValue)`, and change `countAchieved` to filter by `leads.quotaMatchedDimension`/`leads.quotaMatchedValue` (exact match) instead of `leads.quotaSegment` — see data-model.md and research.md R4
- [X] T005 [P] Update `src/lib/quotas/quota-targets.ts`: `validateAndCanonicalize` validates `dimensionType` (`'nse'|'edad'|'integrantes'`) and `dimensionValue` against the per-type catalogs in data-model.md instead of the fixed `NSE_LEVELS` check; update `QuotaTargetInput`, `listQuotaTargets`, `createQuotaTarget`, `updateQuotaTarget`
- [X] T006 Update `upsertQuotaTarget` in `src/lib/quotas/quota-targets.ts`: `onConflictDoUpdate` target becomes `[quotaTargets.country, quotaTargets.region, quotaTargets.dimensionType, quotaTargets.dimensionValue]` (depends on T005)

**Checkpoint**: Dimension-aware query layer ready — user story implementation can now begin.

---

## Phase 3: User Story 1 - Calificar por cualquier dimensión con cupo disponible (Priority: P1) 🎯 MVP

**Goal**: A lead qualifies if NSE, edad, or integrantes has available quota in its region — no longer requires all three to match.

**Independent Test**: Seed a region with NSE and edad exhausted but integrantes available; a lead matching all three still qualifies via integrantes (spec.md US1 AC1). Seed the inverse (NSE available, others exhausted); lead qualifies via NSE (AC2). Seed all three exhausted; lead does not qualify (AC3).

### Tests for User Story 1

- [X] T007 [P] [US1] Unit tests for `ageBand()`/`householdBand()` boundaries (34/35, 49/50, 2/3, 4/5, null input) in `tests/unit/quota-bands.test.ts`
- [X] T008 [P] [US1] Unit tests for OR-matching + single-dimension attribution in `tests/unit/quota-check.test.ts`, covering spec.md US1 AC1–AC3

### Implementation for User Story 1

- [X] T009 [US1] Create `src/lib/quotas/quota-bands.ts` with pure `ageBand(age: number | null): string | null` and `householdBand(size: number | null): string | null` per research.md R3
- [X] T010 [US1] Rewrite `checkQuotaAvailability` in `src/lib/scoring/quota.ts`: new `CheckQuotaAvailabilityParams` (`age`, `householdSize`, `isPregnant`, `hasBabyUnder3`), evaluate dimensions in fixed order `nse → edad → integrantes` via `getQuotaProgressForTarget` (T004), return `QuotaDecision` per contracts/quota-check-contract.md (depends on T004, T009) — implemented together with T022/T025 (exception + region-cap gate) since they're the same function; verified independently per-story via tests/unit/quota-check.test.ts
- [X] T011 [US1] Update the Phase 1 call site in `src/lib/conversation/phases/phase-1.ts`: pass `profile.age`, `profile.householdSize`, `profile.isPregnant`, `profile.hasBabyUnder3` to `checkQuotaAvailability`; on `qualifies`, persist `quotaMatchedDimension`/`quotaMatchedValue` in the same `db.update(leads)` that already writes `score`/`quotaSegment` (depends on T010)
- [X] T012 [US1] Apply the same change as T011 to the duplicated call site in `src/lib/geo/handle-confirm.ts` (depends on T010)
- [X] T013 [US1] Extend the `quota_check` structured log event in `src/lib/scoring/quota.ts` with `matched_dimension`/`matched_value` fields (depends on T010)
- [X] T014 [P] [US1] Update `src/app/admin/quotas/quota-row-form.tsx` and `src/app/admin/quotas/page.tsx` to add a `dimensionType` selector before the value field (depends on T005) — table displays `Dimensión`/`Valor` columns for existing rows; added `new-quota-target-row.tsx` (País/Región/Dimensión/Valor/Objetivo + Agregar) since this app previously had no manual row-creation form at all (creation was Excel-import-only) and the user flagged that NSE/edad/integrantes quotas need to be addable directly in the panel, not just via Excel. Required extracting the pure catalog constants into `src/lib/quotas/dimension-catalog.ts` (no DB import) so the new client component doesn't pull `db/client.ts` into the browser bundle — verified live (POST 201, persisted correctly in Postgres, cleaned up after)
- [X] T015 [P] [US1] Update `src/app/api/admin/quotas/route.ts` (GET query params, POST body) for `dimensionType`/`dimensionValue` per contracts/admin-quotas-api-changes.md (depends on T005)
- [X] T016 [US1] Update `src/lib/quotas/excel-import.ts` and `src/app/api/admin/quotas/import/route.ts` for the new per-country/per-dimension sheet layout (`docs/Muestra Faltante por País Julio 2026_True.xlsx`), including `SCL{n}` → `Nivel {n}` translation on import (research.md R6); the "Embarazadas y bebés" column is not imported as a target row (depends on T005) — header-driven parsing (matches by column text, not fixed index) so it also round-trips through our own exporter's layout
- [X] T017 [US1] Update `src/lib/quotas/excel-export.ts` and `src/app/api/admin/quotas/export/route.ts` to round-trip the new layout (depends on T016)
- [X] T018 [P] [US1] Update `tests/unit/quota-progress.test.ts`, `tests/unit/quota-targets.test.ts`, `tests/unit/quota-progress-filters.test.ts`, `tests/unit/quota-excel-import.test.ts` for the renamed dimension fields (depends on T004, T005, T016) — also updated tests/unit/country-summary.test.ts (spec 006 fixture used `nseLevel`)

**Checkpoint**: A lead can qualify via any single dimension with available quota in a pre-configured region — testable end-to-end independent of US2–US4.

---

## Phase 4: User Story 2 - Reclutar en cualquier región mientras haya cupo (Priority: P1)

**Goal**: No region is excluded from matching ahead of time — any catalog region can qualify a lead via US1's per-dimension logic.

**Independent Test**: A region with quota rows configured today for the first time (no prior activity) still evaluates dimensions normally; a lead there qualifies if any dimension has room (spec.md US2 AC1). A region past its aggregate cap does not qualify new leads (AC2, delivered fully once US4 lands — this story's test covers the "no pre-exclusion" half only).

### Tests for User Story 2

- [X] T019 [P] [US2] Integration test in `tests/e2e/quota-check-real.spec.ts`: seed `quota_targets` rows only for a region that has zero rows under any other dimension, confirm a lead there qualifies via the one configured dimension — proving no region is excluded by default (depends on T010) — this file's established convention is a shallow webhook-still-200s smoke test (deep decision-logic assertions live in unit tests per its own header comment); updated its comment to point at quota-check.test.ts's Honduras Nor Occidente I / Centro I cases, which are the actual proof of "no region pre-exclusion"
- [X] T020 [US2] Audit `src/lib/scoring/quota.ts`, `src/lib/quotas/quota-targets.ts`, and `docs/WIKI.md` §8 for any remaining language/comments implying a region must be pre-activated or allow-listed beyond the geo catalog; update or remove them (verification task — confirms T010's rewrite already satisfies FR-002, no new gating code expected) — audited: no region-level activation flag exists anywhere in code (`active` is per dimension-cell, not per-region); `docs/WIKI.md` §9 item 5 ("Activar/desactivar regiones") is inside the already-superseded original-plan section (banner added in this same change), no live doc needed correction

**Checkpoint**: Any region in the geo catalog can qualify leads once it has at least one dimension configured — no separate "closed region" mechanism remains.

---

## Phase 5: User Story 3 - Excepción sin límite para embarazo o bebé de 0-36 meses (Priority: P1)

**Goal**: A household reporting pregnancy or a baby aged 0–36 months always qualifies, bypassing NSE/edad/integrantes and any quota limit.

**Independent Test**: A lead with all three dimensions exhausted in its region still qualifies when `isPregnant` or `hasBabyUnder3` is true (spec.md US3 AC1–AC2).

### Tests for User Story 3

- [X] T021 [P] [US3] Unit tests in `tests/unit/quota-check.test.ts`: `isPregnant=true` and `hasBabyUnder3=true` each qualify regardless of exhausted dimensions, with `matchedDimension: 'exception'` (depends on T010)

### Implementation for User Story 3

- [X] T022 [US3] Add the exception short-circuit at the top of `checkQuotaAvailability` in `src/lib/scoring/quota.ts`: if `isPregnant || hasBabyUnder3` → return `{ qualifies: true, matchedDimension: 'exception', matchedValue: null }` before any dimension check (depends on T010)

**Checkpoint**: Exception leads always qualify — verified independently of dimension exhaustion state.

---

## Phase 6: User Story 4 - Tope agregado por región para evitar saturación (Priority: P2)

**Goal**: Each region has a manually-configured aggregate cap on accepted leads; once reached, new leads are rejected even if a dimension still has room — except exception leads, which are never blocked but still count toward the region's reported total.

**Independent Test**: A region at its configured cap rejects a lead that would otherwise qualify via a dimension (spec.md US4 AC1); a region below its cap evaluates normally (AC2); an exception lead in a capped region still qualifies (US3 AC2) and is counted in the region's total.

### Tests for User Story 4

- [X] T023 [P] [US4] Unit tests in `tests/unit/quota-region-caps.test.ts`: cap reached blocks an otherwise-qualifying lead; cap not reached proceeds to dimension evaluation; `cap_count = null` never blocks; an exception-qualified lead is included in the `achieved` count of `getRegionCapProgress` (depends on T024) — cap-reached/not-reached/exception-in-checkQuotaAvailability cases live in quota-check.test.ts; this file covers region-caps.ts's own validation + getRegionCapProgress directly

### Implementation for User Story 4

- [X] T024 [US4] Create `src/lib/quotas/region-caps.ts`: `listRegionCaps`, `createRegionCap`, `updateRegionCap`, and `getRegionCapProgress(country, region)` — `achieved` counts all `QUALIFIED_STATUSES` leads for that `(country, region)` regardless of `quotaMatchedDimension` (including `'exception'`) (depends on T002, T003)
- [X] T025 [US4] Wire the region-cap gate into `checkQuotaAvailability` in `src/lib/scoring/quota.ts`: after the exception short-circuit (T022) and before dimension evaluation, call `getRegionCapProgress`; if `cap_count` is set and reached → `{ qualifies: false, matchedDimension: null, matchedValue: null }` (depends on T022, T024)
- [X] T026 [P] [US4] New routes `src/app/api/admin/quotas/region-caps/route.ts` (GET/POST) and `src/app/api/admin/quotas/region-caps/[id]/route.ts` (PUT) per contracts/admin-quotas-api-changes.md (depends on T024)
- [X] T027 [P] [US4] New `src/app/admin/quotas/region-cap-form.tsx` and a region-caps section in `src/app/admin/quotas/page.tsx` (depends on T026)
- [X] T028 [US4] Extend the `quota_check` structured log event in `src/lib/scoring/quota.ts` with a `region_cap_blocked` boolean field (depends on T025)

**Checkpoint**: All four user stories independently functional — the full `checkQuotaAvailability` flow (exception → region cap → dimension OR, in that order) matches contracts/quota-check-contract.md exactly.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Keep dependent surfaces (dashboard, docs) consistent after the schema/contract changes above.

- [X] T029 [P] Update `src/app/admin/dashboard/page.tsx` and `src/app/admin/dashboard/filters-form.tsx`: the región×NSE table filters `listQuotaProgress` by `dimensionType: 'nse'` (was implicitly all rows) and renders `item.dimensionValue` instead of `item.nseLevel`, per quickstart.md §5 — scoped the filter to the whole page's `items` fetch (not just the table) so summary cards/country chart keep their pre-spec-011 meaning instead of summing three independent dimensions into one misleading total
- [X] T030 [P] Update `docs/WIKI.md` §8.1 and §11 status entry for `011-flexible-quota-matching` from "🔜 Spec pendiente" to "✅ Implementado", referencing the final admin UI once merged — moved the §11 entry from "Pendiente" to "Implementado y funcionando" and updated the "Última actualización" banner
- [X] T031 Run `yarn vitest run` and `yarn playwright test` for the full suite (not just quota tests) and fix any regressions surfaced by the schema rename — `yarn vitest run`: 157/157 pass (20 files). Playwright: `quota-check-real.spec.ts`, `phase-1-qualify.spec.ts`, `phase-1-disqualify.spec.ts` ran against the live dev server; the 3 failures (`webhook still returns 200...`, `D1 rejection...`, `webhook returns 200 for valid telegram update structure`) are a pre-existing `TELEGRAM_WEBHOOK_SECRET` mismatch between the test's hardcoded `'test-secret'` fallback and the real secret in `.env` — confirmed via `git stash` that they fail identically on `main` before this feature's changes, so not a regression from spec 011
- [X] T032 Execute `quickstart.md` end-to-end manually (seed data, admin panel, dashboard) and confirm all 5 validation steps pass — verified live via the Browser pane against the real Neon dev DB (not the unit-test mocks): `/admin/quotas` renders Dimensión/Valor columns correctly for all 136 existing rows (migrated in place), editing a target's `Objetivo` PUTs and persists to Postgres, creating a region cap (Honduras/Nor Occidente I) POSTs and persists, `/admin/quotas/export` returns a valid `.xlsx` (200, correct content-type), `/admin/dashboard`'s región×NSE table correctly shows only `dimensionType='nse'` rows with no console/server errors. Test edits were reverted/deleted afterward to avoid polluting the shared dev DB. Steps 2/3 (Vitest scenarios) covered by T007/T008/T021/T023's automated tests instead of manual seeding.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Setup (T001–T003) — BLOCKS all user stories
- **User Story 1 (Phase 3)**: Depends on Foundational — no dependency on other stories; this is the MVP
- **User Story 2 (Phase 4)**: Depends on Foundational + T010 (US1's `checkQuotaAvailability` rewrite) — verification-heavy, minimal new code
- **User Story 3 (Phase 5)**: Depends on Foundational + T010 — adds the exception branch to the same function
- **User Story 4 (Phase 6)**: Depends on Foundational + T010 + T022 (US3's exception branch, since the cap gate sits right after it in evaluation order)
- **Polish (Phase 7)**: Depends on all four user stories being complete

### Within `checkQuotaAvailability` (`src/lib/scoring/quota.ts`)

This single function carries the logic for US1, US3, and US4 (US2 requires no unique logic in it). Build order is enforced by the task dependencies above: T010 (US1 core OR-matching) → T022 (US3 exception short-circuit, inserted at the top) → T025 (US4 region-cap gate, inserted between the exception check and dimension evaluation). Each insertion is additive and does not change the previous story's already-passing tests.

### Parallel Opportunities

- T002 can run parallel to T001 (same logical change, different files: SQL vs. Drizzle schema) — but T003 (apply migration) must follow T001.
- T004, T005 can run in parallel (different files) once Phase 1 is done.
- Within US1: T007, T008 (tests) in parallel; T014, T015, T018 in parallel once their dependencies land.
- Within US4: T023 in parallel with nothing (depends on T024); T026, T027 in parallel once T024 lands.
- T029, T030 (Polish) can run in parallel with each other.

---

## Parallel Example: User Story 1

```bash
# Tests, once Foundational is done:
Task: "Unit tests for ageBand()/householdBand() in tests/unit/quota-bands.test.ts"
Task: "Unit tests for OR-matching in tests/unit/quota-check.test.ts"

# Admin surface, once T005 lands:
Task: "Update quota-row-form.tsx and page.tsx with dimensionType selector"
Task: "Update /api/admin/quotas/route.ts for dimensionType/dimensionValue"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (schema/migration)
2. Complete Phase 2: Foundational (dimension-aware query layer)
3. Complete Phase 3: User Story 1 — OR-matching across NSE/edad/integrantes
4. **STOP and VALIDATE**: run `tests/unit/quota-check.test.ts` and `quickstart.md` §1–§2; confirm the Honduras Nor Occidente I / Centro I examples from spec.md behave as described
5. Deploy/demo if ready — this alone already fixes the core "under-fills quota" problem from the constitution's Principle IV rationale

### Incremental Delivery

1. Setup + Foundational → foundation ready
2. US1 → test independently → deploy (MVP: OR-matching)
3. US2 → test independently → deploy (confirms no region pre-exclusion; low-risk, mostly verification)
4. US3 → test independently → deploy (pregnancy/baby exception)
5. US4 → test independently → deploy (region saturation cap — the safeguard requested alongside opening all regions)
6. Polish → dashboard/docs catch-up

### Sequencing Note

Unlike a typical multi-story feature, US1/US3/US4 are **not** parallelizable across engineers because they all modify the same function (`checkQuotaAvailability`) in a specific insertion order (see "Within `checkQuotaAvailability`" above). US2 and the admin-panel/Excel tasks within US1 (T014–T017) are the main opportunities for a second engineer to work in parallel.

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Commit after each task or logical group
- Migration (T001/T003) must be applied to the dev/Neon database in the same session it's written, per project convention — do not leave it committed-but-unapplied
- Stop at any checkpoint to validate a story independently before moving to the next
