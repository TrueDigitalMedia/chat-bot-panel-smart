---

description: "Task list for 006-leads-dashboard"
---

# Tasks: Dashboard de leads

**Input**: Design documents from `/specs/006-leads-dashboard/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [quickstart.md](./quickstart.md)

**Tests**: Included for the new pure-logic pieces (funnel counting, filter extension) — same bar as spec 005. No e2e test: this is a read-only reporting surface, not a lead-capture path (constitution only mandates e2e for lead capture).

**Organization**: Tasks are grouped by user story (P1–P2 from spec.md). ⚠️ Unlike spec 005, this is a **single-page dashboard** — US1 creates `page.tsx`, and US2/US3/US4 all edit that same file to add their section. True cross-story parallelism is limited; see Dependencies.

## Format: `[ID] [P?] [Story] Description`

## Path Conventions

Single Next.js project — `src/`, `tests/` at repository root (plan.md § Project Structure).

---

## Phase 1: Setup

- [ ] T001 Confirm `/admin/dashboard` needs no new env vars — `ADMIN_PASSWORD` (spec 005) already covers it via `src/middleware.ts`'s `/admin/:path*` matcher (research.md R6). No file changes.

---

## Phase 2: Foundational

**Purpose**: N/A. No shared infrastructure separate from the stories — `listQuotaProgress()` (spec 005) already exists and needs no changes for US1/US2 to work unfiltered. Proceed straight to Phase 3.

---

## Phase 3: User Story 1 - Resumen global del progreso de la campaña (Priority: P1) 🎯 MVP

**Goal**: Summary cards (Objetivo/Conseguidos/Disponibles/% Avance) and the per-country bar chart (FR-004 — assigned here; spec.md doesn't tie it to a specific story number, and it's thematically a "global view" like the cards).

**Independent Test**: Open the dashboard with known leads/quotas and confirm the cards match a direct DB query, per spec.md's own Independent Test.

### Implementation for User Story 1

- [X] T002 [US1] Create `src/app/admin/dashboard/dashboard.module.css`, reusing the visual language from `src/app/admin/quotas/quotas.module.css` (summary cards, table, page/header patterns). Also pre-added funnel/filters/refresh classes used by later stories (inert until wired).
- [X] T003 [US1] Create `src/lib/dashboard/country-summary.ts`: `groupProgressByCountry(items: QuotaProgress[]): CountrySummary[]` — pure function grouping `listQuotaProgress()` results by country, summing target/achieved, computing pct (0 when target is 0, no divide-by-zero). Not in the original plan.md file list — small natural extraction for testability, same reasoning as spec 005's `toProgress()`.
- [X] T004 [US1] Create `src/app/admin/dashboard/page.tsx` (Server Component): call `listQuotaProgress()` unfiltered (filters land in US4), compute and render the 4 summary cards (same aggregation as `/admin/quotas`'s page), and render the per-country bar chart via T003's helper (plain CSS bars — research.md R1, no `recharts`).
- [X] T005 [US1] Write `tests/unit/country-summary.test.ts`: aggregation math across multiple regions per country, a country with target=0 doesn't divide by zero, sort order, empty input returns `[]`. 5 tests, all passing.

**Checkpoint**: `/admin/dashboard` shows cards + country chart matching `/admin/quotas`'s totals. Deployable alone — table/funnel/filters aren't required for this to be useful. `npx tsc --noEmit` clean (only pre-existing unrelated error).

---

## Phase 4: User Story 2 - Progreso detallado por región y nivel NSE (Priority: P1)

**Goal**: Región×NSE table with red/yellow/green color-coding by % avance.

**Independent Test**: Compare 2-3 rows against a direct DB query and against `/admin/quotas` (same underlying data) — colors match the documented thresholds.

### Implementation for User Story 2

- [X] T006 [US2] In `src/app/admin/dashboard/page.tsx` (T004), add the región×NSE table section (read-only — no edit/toggle controls, those live in `/admin/quotas`), reusing `listQuotaProgress()`'s already-fetched data. Depends on T004 (same file).
- [X] T007 [US2] Add a local `pctColorClass(pct)` helper in `page.tsx` (red `<25`, yellow `<75`, green else) applied per cell. Not extracted into a shared util — it's a 3-line function that already exists once in `quota-row-form.tsx` (spec 005); duplicating a second time is fine per the constitution ("duplicated logic acceptable until a pattern repeats three or more times"), extract only if a third caller shows up.

**Checkpoint**: Table renders with correct colors; independently useful even before US3/US4 exist. `npx tsc --noEmit` clean.

---

## Phase 5: User Story 3 - Embudo de conversión (Priority: P2)

**Goal**: 7-stage funnel with the biggest-drop stage highlighted (SC-004).

**Independent Test**: Seed leads across different statuses and confirm each stage's count matches leads that reached-or-passed it, per spec.md's Independent Test.

### Implementation for User Story 3

- [X] T008 [US3] Create `src/lib/dashboard/funnel.ts`: `getConversionFunnel(filters?)` implementing the 7 stages from data-model.md (started → passed_d1 → passed_d3 → survey_completed → qualified [reusing `QUALIFIED_STATUSES` from `quota-progress.ts`] → registered → ficha_hogar_completada), with `pctOfPrevious`/`pctOfTotal` per stage and `biggestDropStageKey` (biggest **percentage** drop vs. previous stage, ties broken by earliest stage — documented, not left implicit).
- [X] T009 [US3] Add the funnel section to `page.tsx` (T004), calling T008 unfiltered for now (filtering is US4). Depends on T004, T008.
- [X] T010 [US3] Write `tests/unit/conversion-funnel.test.ts`: stage counts against a synthetic lead-status distribution, `pctOfPrevious=0` on the first stage, `biggestDropStageKey` across 2 distributions plus an explicit tie-breaking case, and an all-zero funnel (no divide-by-zero). 4 tests, all passing.

**Checkpoint**: Funnel renders with correct counts and highlights the right drop-off stage. `npx vitest run tests/unit` → 93/93 passing (+9 across US1+US2+US3, zero regressions).

---

## Phase 6: User Story 4 - Filtros de segmentación (Priority: P2)

**Goal**: País/NSE/región/canal/rango-de-fechas filters via URL search params, applied per the matrix in data-model.md (funnel excludes region/nseLevel — research.md R4, already confirmed with the user).

**Independent Test**: Apply a filter and confirm cards/tabla/gráfico/embudo recalculate to match a manually-filtered DB query.

### Implementation for User Story 4

- [X] T011 [US4] Extend `src/lib/quotas/quota-progress.ts`: add optional `channel`/`dateFrom`/`dateTo` to `QuotaProgressFilters` and thread them into `countAchieved()`'s `WHERE` clause (via a new internal `AchievedFilters` param, default `{}`). **Additive only** — verified via T015's regression-guard test that spec 005's existing call shape is unaffected, plus the full pre-existing suite (`quota-progress.test.ts`, `quota-targets.test.ts`) still passes unchanged.
- [X] T012 [US4] Extend `src/lib/dashboard/funnel.ts` (T008) with `country`/`channel`/`dateFrom`/`dateTo` filters only — deliberately no `region`/`nseLevel` param (research.md R4). **Already done as part of T008** — `FunnelFilters` and `countLeads()` were built with these from the start rather than added later; no separate change needed here.
- [X] T013 [US4] Update `page.tsx` to read `searchParams` (`country`, `region`, `nseLevel`, `channel`, `from`, `to`) and pass the appropriate subset into `listQuotaProgress()` (US1/US2 sections, all 5 params) and `getConversionFunnel()` (US3 section, only `country`/`channel`/`from`/`to`). Depends on T004, T009, T011, T012 (same file as T004/T006/T009 — sequential, not parallel with those). Used Next.js 15+'s async `searchParams: Promise<...>` convention (same pattern as the `[id]/route.ts` dynamic params in spec 005).
- [X] T014 [US4] Create `src/app/admin/dashboard/filters-form.tsx` (Client Component): dropdowns (país, región [cascading from país via a `regionsByCountry` map computed server-side], NSE, canal) + date range inputs that update the URL via `router.push` with new search params, plus a "Limpiar filtros" button. Depends on T013.
- [X] T015 [US4] Write `tests/unit/quota-progress-filters.test.ts`: spies on `eq`/`gte`/`lte` (via a `drizzle-orm` partial mock) to verify channel/date conditions are added only when the corresponding filter is passed, combining both, and a regression guard confirming a spec-005-shaped call (no channel/date) adds neither. 5 tests, all passing.

**Checkpoint**: All 4 views respond to filters per the matrix in data-model.md; the region/nseLevel-excluded-from-funnel behavior is implemented (page.tsx never passes region/nseLevel to `getConversionFunnel`). `npx vitest run tests/unit` → 98/98 passing (+5, zero regressions). `npx tsc --noEmit` clean.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T016 [P] Create `src/app/admin/dashboard/refresh-poller.tsx` (Client Component): `setInterval(() => router.refresh(), 60_000)` + a manual "Actualizar" button (research.md R7, satisfies FR-007/SC-002). Depends on T004 (page must exist to embed it) but is otherwise a self-contained new file — parallel with T006/T007/T009/T010/T012/T015 (different file).
- [X] T017 [P] Add a small cross-link between `/admin/quotas` and `/admin/dashboard` in each page's header (`Link` to the other) — sibling admin pages, low-cost navigation improvement, not gated by any FR but directly useful. Different files from T016 — parallel.
- [X] T018 Run `npx vitest run` and `npx tsc --noEmit` (full regression). **Result**: 112/112 actual tests pass (was 98 after US4 — net +14 across US1–US4, zero regressions). "6 failed" test *files* are the same known Playwright-under-vitest issue from specs 004/005 (5 pre-existing + `quota-check-real.spec.ts`) — 006 added no new e2e spec, so no new entries in that category. `tsc --noEmit` clean except the pre-existing unrelated `persist-eval.ts` error.
- [ ] T019 Execute [quickstart.md](./quickstart.md) §§ 1–5 against a local dev server + the already-imported quota data from spec 005. **Not run** — same reasoning as spec 005's T011/T030: requires `npm run dev` against the real Neon DB; flagging for explicit go-ahead.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (T001)**: none.
- **Foundational**: empty — see note above.
- **US1 (T002–T005)**: no dependencies beyond spec 005's existing `listQuotaProgress()`. Creates `page.tsx` (T004) — every later story edits this same file.
- **US2 (T006–T007)**: depends on T004 (edits the same file).
- **US3 (T008–T010)**: T008 has no dependency; T009 depends on T004 (same file) and T008.
- **US4 (T011–T015)**: T011/T012 are independent of `page.tsx`; T013 depends on T004, T009, T011, T012 (touches the same file as T004/T006/T009 — sequential with those, not parallel); T014 depends on T013; T015 depends on T011.
- **Polish (T016–T019)**: T016/T017 depend on T004 only; T018/T019 after everything.

### Parallel Opportunities

Less than spec 005 because `page.tsx` is a genuine shared file across US1/US2/US3's page-editing tasks (T004, T006, T009, T013) — those five must run **sequentially**, not in parallel, regardless of story boundaries. What *can* run in parallel:

- T003 (US1, `country-summary.ts`) and T008 (US3, `funnel.ts`) — different files, no shared dependency — can be built in parallel by two people even before `page.tsx` exists, since both are pure functions independent of the page.
- T011 (US4, `quota-progress.ts` filter extension) can be built any time in parallel with T002/T003/T008 — different file.
- T014 (filters UI), T016 (poller), T017 (cross-links) are three different new files once their respective page-edit dependency lands — parallel with each other.
- T005, T010, T015 (the three test files) are independent of each other — parallel once their respective source file exists.

---

## Parallel Example: Before `page.tsx` exists

```bash
# Three independent pure-logic modules, no shared files:
Task: "US1 — Create src/lib/dashboard/country-summary.ts (T003)"
Task: "US3 — Create src/lib/dashboard/funnel.ts (T008)"
Task: "US4 — Extend src/lib/quotas/quota-progress.ts with channel/date filters (T011)"
```

---

## Implementation Strategy

### MVP scope: US1 alone

Cards + country chart, unfiltered, is genuinely useful on its own — same reasoning as spec 005's US1. Ship T001–T005 first.

### Incremental Delivery

1. T001–T005 (US1) → cards + chart live. **Deploy.**
2. T006–T007 (US2) → región×NSE table added to the same page. **Deploy.**
3. T008–T010 (US3) → funnel added. **Deploy.**
4. T011–T015 (US4) → filters wire up across all three sections. **Deploy.**
5. T016–T019 (Polish).

### Parallel Team Strategy

The three pure-logic modules (T003, T008, T011) can be built simultaneously by different people before anyone touches `page.tsx` — then `page.tsx` itself (T004→T006→T009→T013) must be assembled by one owner sequentially to avoid merge conflicts on the same file.

---

## Notes

- [P] tasks touch different files with no unmet dependency.
- `page.tsx` is the one recurring bottleneck in this feature — plan commits accordingly (e.g., one person owns the page-assembly sequence T004/T006/T009/T013 even if the underlying logic modules were built in parallel).
- Re-run the relevant test file after each task.
