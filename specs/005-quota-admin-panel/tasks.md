---

description: "Task list for 005-quota-admin-panel"
---

# Tasks: Panel administrativo de cuotas

**Input**: Design documents from `/specs/005-quota-admin-panel/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/admin-quotas-api.md](./contracts/admin-quotas-api.md), [quickstart.md](./quickstart.md)

**Tests**: Included where the constitution requires them (lead-capture path → US1 needs an e2e test) or where research.md flagged a real silent-failure risk (catalog/Excel normalization, active-exclusion). Not exhaustively added to every CRUD route — this is an internal admin tool, not a lead-capture path.

**Organization**: Tasks are grouped by user story (P1–P4 from spec.md). Unlike 004, most stories here touch genuinely separate files, so more of this is truly parallelizable — see Dependencies.

## Format: `[ID] [P?] [Story] Description`

## Path Conventions

Single Next.js project — `src/`, `tests/` at repository root (plan.md § Project Structure).

---

## Phase 1: Setup

- [ ] T001 Confirm `POSTGRES_URL` is set and reachable, and that `xlsx`/`drizzle-orm` are already installed (`package.json` — no new dependency needed per plan.md). No file changes.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared infrastructure every user story needs — the table, the corrected geo-catalog helpers, and the progress/count query. US1 does **not** need T012 (auth middleware, US2) to function; everything else in this phase blocks all 5 stories.

- [X] T002 In `src/lib/db/schema.ts`, add the `quotaTargets` table (`country`, `region`, `nseLevel`, `targetCount`, `active`, `notes`, `createdAt`, `updatedAt`) with a `UNIQUE(country, region, nse_level)` index, per [data-model.md](./data-model.md).
- [X] T003 Write `src/lib/db/migrations/0010_quota_targets.sql` from T002. **Note**: this repo's existing migrations (0001–0009) are hand-written raw SQL, not generated via `drizzle-kit generate` (no `meta/_journal.json` present) — followed that established convention instead. Depends on T002.
- [X] T004 [P] In `src/lib/geo/cam-nse-catalog.ts`, add `rd: 'Rep. Dominicana'` to `canonicalCountry()`'s alias map (research.md R2 — the Excel prefixes RD rows `"RD - ..."`, which the current map doesn't recognize). Verified: `canonicalCountry('RD')` → `'Rep. Dominicana'`.
- [X] T005 In `src/lib/geo/cam-nse-catalog.ts`, add `listNseRegionsForCountry(country: string): string[]`, deriving unique `nseRegion` values from the existing `catalog.countries[country]` data (research.md R3 — the closed dropdown source). Same file as T004 — sequential. Verified output matches research.md R2's manual dump exactly (Costa Rica: 5 regions, Guatemala: 6 regions). **Follow-up finding (during T019/T021)**: also added `canonicalNseRegion(country, region)` to the same file — the real Excel has `"RD - Cibao Sin Santiago"` (capital S) vs. the catalog's `"Cibao sin Santiago"` (lowercase); an exact-match `.includes()` check silently rejected it. Case/accent-insensitive matching (reusing `normalizeGeoKey`) was needed, mirroring `canonicalCountry()`'s existing pattern. `quota-targets.ts` (T013) and `excel-import.ts` (T019) both use it now instead of exact string matching.
- [X] T006 [P] Create `src/lib/quotas/quota-progress.ts`: `getQuotaProgressForTarget(target)` (single combination) and `listQuotaProgress(filters?)` (all combinations) — joins `quota_targets` with `leads`/`survey_profiles` on `country`/`nseRegion`/`quotaSegment`, counts leads with `leadStatus` in the `QUALIFIED_STATUSES` set (research.md R4), computes `available = Math.max(0, target - achieved)`, and excludes `active: false` rows from any *availability* decision (they still appear in listings). Depends on T003 (table must exist).

**Checkpoint**: `quota_targets` table exists; catalog helpers are correct; the core progress query works. User stories can now proceed.

---

## Phase 3: User Story 1 - Verificación de cupo real en el bot (Priority: P1) 🎯 MVP

**Goal**: `checkQuotaAvailability` decides based on real `quota_targets` data instead of a random hash.

**Independent Test**: Seed one `quota_targets` row directly (SQL insert, no admin UI needed yet), drive a test lead through the survey, and confirm the lead-status transition matches the seeded target/achieved state. Fully testable without any of US2–US5 existing.

### Implementation for User Story 1

- [X] T007 [US1] Rewrite `src/lib/scoring/quota.ts`: `checkQuotaAvailability({ country, nseRegion, segment, leadId? }): Promise<boolean>`, calling `getQuotaProgressForTarget()` from T006, returning `available > 0 && active`, and logging a structured `event: "quota_check"` line (country, region, segment, target, achieved, available) replacing the old `[quota:mock]` log (plan.md § Constitution Check — Observability). Depends on T006.
- [X] T008 [US1] [P] In `src/lib/conversation/phases/phase-1.ts` (~line 272), update the `checkQuotaAvailability(segment, lead.id)` call to the new object signature, passing `profile.country` and `profile.nseRegion` (already loaded in this block). Depends on T007.
- [X] T009 [US1] [P] In `src/lib/geo/handle-confirm.ts` (~line 94), same call-site update as T008. Different file — parallel with T008.
- [X] T010 [US1] Write `tests/unit/quota-progress.test.ts`: target/achieved/available math (via exported `toProgress`), `available` clamped at 0 when achieved exceeds target, a combination with no `quota_targets` row at all behaves as unavailable (spec edge case). 8 tests, all passing. Depends on T006/T007. **Note**: `src/lib/db/client.ts` calls `neon()` eagerly at import time, which crashed vitest without `POSTGRES_URL` — mocked `@/lib/db/client` in the test file to avoid needing a live connection for pure-logic tests.
- [X] T011 [US1] Write `tests/e2e/quota-check-real.spec.ts` (follows the existing `tests/e2e/phase-1-qualify.spec.ts`/`phase-1-disqualify.spec.ts` shallow-smoke pattern, which itself doesn't drive a full survey to a DB-state assertion). Written but **not executed** — running it spins up `npm run dev` + hits the real Neon DB in `.env` via Playwright's `webServer`, which is a side-effecting action against what may be a shared dev database; flagging for the user's go-ahead before running. Depends on T008, T009.

**Checkpoint**: `npx vitest run tests/unit/quota-progress.test.ts` green (verified — 8/8, and confirms zero regressions in the other 58 pre-existing unit tests, 66/66 total). `npx playwright test tests/e2e/quota-check-real.spec.ts` **not yet run** — needs explicit confirmation (see T011 note). The bot's quota decisions are now real — this alone is safe to deploy even with zero `quota_targets` rows populated yet (every combination is simply "unavailable" until an admin — or a raw SQL insert — adds targets, which is a strictly safer default than today's 50/50 random mock).

---

## Phase 4: User Story 2 - Visualizar y editar objetivos de cuota (Priority: P1)

**Goal**: An authenticated admin can view and edit quota targets at `/admin/quotas`.

**Independent Test**: `curl -u admin:$PW -X PUT .../api/admin/quotas/<id> -d '{"targetCount":60}'` and confirm the change persists and progress recalculates — no dependency on US1's bot-side wiring (US2 reads/writes `quota_targets` directly).

### Implementation for User Story 2

- [X] T012 [US2] [P] Create `src/middleware.ts`: HTTP Basic Auth gate (`matcher: ['/admin/:path*', '/api/admin/:path*']`) checking a fixed `admin` user against `process.env.ADMIN_PASSWORD`; `401` + `WWW-Authenticate: Basic realm="admin"` on failure (research.md R5). Fails closed (401) if `ADMIN_PASSWORD` isn't set at all.
- [X] T013 [US2] Create `src/lib/quotas/quota-targets.ts`: `listQuotaTargets(filters?)`, `createQuotaTarget(input)`, `updateQuotaTarget(id, patch)`, `upsertQuotaTarget(input)` (used later by US3's importer) — validating `country`/`region` against `listNseRegionsForCountry()` (T005) and rejecting invalid combinations per [contracts/admin-quotas-api.md](./contracts/admin-quotas-api.md).
- [X] T014 [US2] [P] Create `src/app/api/admin/quotas/route.ts`: `GET` (list + progress + summary, via T006/T013) and `POST` (create, via T013), per the contract. Depends on T013.
- [X] T015 [US2] [P] Create `src/app/api/admin/quotas/[id]/route.ts`: `PUT` (update `targetCount`/`active`/`notes`, via T013), per the contract. Different file from T014 — parallel.
- [X] T016 [US2] Create `src/app/admin/quotas/page.tsx` (Server Component): fetch `listQuotaProgress()` (T006) directly server-side (no self-HTTP-call), render the región×NSE table (Objetivo/Conseguidos/Disponibles/% Avance). Depends on T006.
- [X] T017 [US2] Create `src/app/admin/quotas/quota-row-form.tsx` (Client Component): inline edit of `targetCount`, calling `PUT /api/admin/quotas/[id]` (T015) and refreshing. Depends on T015. (Active/Desactivar toggle intentionally deferred to T023/US4.)
- [X] T018 [US2] Add validation tests to `tests/unit/quota-targets.test.ts`: creating a target with a region not in `listNseRegionsForCountry(country)` is rejected; creating a duplicate `(country, region, nseLevel)` conflicts; `updateQuotaTarget()` bumps `updatedAt` on every call (FR-010). 9 tests, all passing, using an in-memory `db` mock (no live Postgres). Depends on T013.

**Checkpoint**: `/admin/quotas` code complete (not yet run against a live server — see T011's note on the same constraint). `npx vitest run tests/unit` → 75/75 passing (was 66 after US1; +9 from this phase, zero regressions). `npx tsc --noEmit` → only the pre-existing unrelated `persist-eval.ts` error remains.

---

## Phase 5: User Story 3 - Importar cuotas iniciales desde Excel (Priority: P2)

**Goal**: Bulk-load `docs/cam/Kantar Quotas Test.xlsx` into `quota_targets`.

**Independent Test**: `curl -F file=@"docs/cam/Kantar Quotas Test.xlsx" .../api/admin/quotas/import` → `{"imported": 132, "unmatched": []}` (quickstart.md § 2).

### Implementation for User Story 3

- [X] T019 [US3] Create `src/lib/quotas/excel-import.ts`: parse the workbook (`xlsx`, same API as `scripts/import-cam-nse-excel.ts`), split each `"<País> - <Región>"` row label, normalize via `canonicalCountry()` (T004) + `canonicalNseRegion()` (T005 follow-up), and call `upsertQuotaTarget()` (T013) per matched row; collect unmatched rows into the response shape from the contract. Depends on T004, T005, T013. **Verified against the real file directly** (not just fixtures): parsing `docs/cam/Kantar Quotas Test.xlsx` with this exact code → 33/33 regions matched, 132/132 cells, 0 unmatched.
- [X] T020 [US3] [P] Create `src/app/api/admin/quotas/import/route.ts`: `POST multipart/form-data`, `.xlsx`-only validation, delegates to T019. Depends on T019.
- [X] T021 [US3] Write `tests/unit/quota-excel-import.test.ts` using fixture rows shaped like the real sheet (research.md R1): `"RD - Cibao Sin Santiago"` maps to country `Rep. Dominicana` / region `Cibao sin Santiago`; `"Panama - Norte"` maps to `Panamá` (accent normalized); an unrecognized country/region prefix lands in `unmatched`, not silently created; a target of exactly 0 is imported, not skipped. 7 tests, all passing (mocks `upsertQuotaTarget`, no DB needed). Depends on T019.
- [X] T022 [US3] Add `src/app/admin/quotas/import-form.tsx` (Client Component) and wire it into `page.tsx`'s header, posting to T020's route and displaying the `imported`/`unmatched` result. Depends on T016, T020 (see Dependencies § US3 exception noted after the analyze pass).

**Checkpoint**: Importing the real Excel produces 132 rows and zero unmatched (after T004's RD fix + T005's case-insensitive region matching) — verified directly against `docs/cam/Kantar Quotas Test.xlsx`, not just documented. `npx vitest run tests/unit` → 82/82 passing (was 75 after US2; +7, zero regressions).

---

## Phase 6: User Story 4 - Activar/desactivar una región cerrada (Priority: P3)

**Goal**: An admin can close a region+NSE combination without deleting its history.

**Independent Test**: Toggle `active: false` on a row with `available > 0`, then confirm (via US1's path) that a new lead in that combination still gets `quota_exhausted`.

### Implementation for User Story 4

- [X] T023 [US4] Add an "Activar/Desactivar" toggle to `quota-row-form.tsx` (T017), calling `PUT .../[id]` with `{ active }` — the backend logic already exists (T006 excludes inactive rows from availability, T015's `PUT` already accepts `active` per the contract). Depends on T017.
- [X] T024 [US4] Extend `tests/unit/quota-progress.test.ts` (T010) with a case: `active: false` and `available > 0` still yields `checkQuotaAvailability` → `false`. Depends on T010.

**Checkpoint**: Deactivating a region takes effect on the next quota check, no code path bypasses it (quickstart.md § 6). `npx vitest run tests/unit` → 83/83 passing (+1, zero regressions).

---

## Phase 7: User Story 5 - Exportar cuotas a Excel (Priority: P4)

**Goal**: Download current quota state in the same shape Kantar already uses.

**Independent Test**: `curl .../api/admin/quotas/export -o out.xlsx` then re-import it — round-trips to the same data.

### Implementation for User Story 5

- [X] T025 [US5] Create `src/lib/quotas/excel-export.ts`: build an `.xlsx` buffer (via `xlsx`) from `listQuotaProgress()` (T006), using the same row-shape T019 expects on import (round-trip compatible).
- [X] T026 [US5] [P] Create `src/app/api/admin/quotas/export/route.ts`: `GET`, streams T025's buffer with `Content-Disposition: attachment`. Depends on T025. **Fixed a real `tsc` error**: `NextResponse` doesn't accept a raw `Buffer` as body — wrapped in `new Uint8Array(buffer)`.
- [X] T027 [US5] [P] Add an "Exportar" link/button to `src/app/admin/quotas/page.tsx` pointing at T026's route. Depends on T016 (edits the same file created there) and T026 — parallel only with T025/T028, not with T016.
- [X] T028 [US5] Write a round-trip test in `tests/unit/quota-excel-import.test.ts` (T021): `import(export(currentState))` reproduces the same `quota_targets` rows (3 fixture targets across 3 country/region groups, 12 total cells after zero-filling the other levels). 8 tests total in this file, all passing. Depends on T019, T025.

**Checkpoint**: Export/import round-trip verified — closes the loop on research.md R6's design choice. `npx vitest run tests/unit` → 84/84 passing (+1, zero regressions). `npx tsc --noEmit` → only the pre-existing unrelated `persist-eval.ts` error remains.

---

## Phase 8: Polish & Cross-Cutting Concerns

- [X] T029 Run `npx vitest run` and `npx tsc --noEmit` (full regression). **Result**: 98/98 actual tests pass (was 65 before spec 004, 24 of those already existing — net +33 new tests across 004+005, zero regressions). `vitest` reports "6 failed" test *files*: the 5 pre-existing Playwright specs (confirmed unrelated in spec 004) plus this feature's own `quota-check-real.spec.ts` hitting the exact same known `vitest`-can't-run-Playwright issue — not a regression, just one more file in the same known category. `tsc --noEmit` shows only the pre-existing unrelated `persist-eval.ts` error.
- [~] T030 Execute [quickstart.md](./quickstart.md) §§ 1–7 end-to-end against a local dev server + test DB. **Partially done**: migration `0010_quota_targets.sql` applied to the live Neon DB (`quota_targets` table confirmed present with all 9 columns via `information_schema.columns`) at the user's explicit request. Quickstart §§ 2–7 (import the real Excel, hit the API, run the e2e Playwright spec against a running `npm run dev`) still **not run** — separate go-ahead needed before spinning up the dev server against that same DB.
- [X] T031 [P] Add `ADMIN_PASSWORD=` to `.env.example` with a one-line comment (research.md R5 introduces this required env var). Also removed the now-dead `QUOTA_MOCK_AVAILABLE` doc block — `quota.ts` no longer reads it after T007.
- [X] T032 [P] Update `docs/WIKI.md` §11: moved Scoring SCL, Segmentos NSE, Educación PSH, Género (spec 004) and Cuota real + Panel administrativo (spec 005) from ❌/⚠️ to ✅. Also annotated §7.1–7.3/7.5 and §9 as resolved/implemented, keeping the original text as historical context (why the fix was needed). Bumped "Última actualización" to 2026-07-18.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (T001)**: none.
- **Foundational (T002–T006)**: blocks all 5 user stories except that US1 specifically does not need T012 (US2's auth middleware — bot-side, no HTTP admin request involved).
- **US1 (T007–T011)**: needs only Foundational. Independently deployable — see checkpoint note.
- **US2 (T012–T018)**: needs only Foundational (not US1's files).
- **US3 (T019–T022)**: needs T004/T005 (Foundational) and T013 (US2's `quota-targets.ts` — specifically the module, not US2's routes/UI). **Exception**: T022 (the upload form UI) does need T016 (US2's `page.tsx`), since it's added into that same file — T019–T021 (the actual import logic + API route + tests) do not, and already satisfy US3's Independent Test on their own via `curl`.
- **US4 (T023–T024)**: needs T017 (US2's client form) and T006/T010 (Foundational/US1's test file).
- **US5 (T025–T028)**: needs T006 (Foundational) and T019 (US3's row-shape, for round-trip compatibility). **T027 also needs T016** (US2's `page.tsx` — it adds the export link into that same file); T025/T026/T028 don't.
- **Polish (T029–T032)**: after everything else.

### Parallel Opportunities

More than spec 004 — most stories land in different files:

- Within Foundational: T004 and T006 are different files, parallel; T002→T003 and T004→T005 are each sequential same-file pairs.
- **US1 and US2 can be built in parallel by two people** once Foundational is done — they share only T006 (already done) and touch no common files (`quota.ts`/`phase-1.ts`/`handle-confirm.ts` vs `middleware.ts`/`quota-targets.ts`/`app/admin/**`/`app/api/admin/**`).
- Within US1: T008 and T009 (different call-site files) are parallel.
- Within US2: T014 and T015 (different route files) are parallel, both depending only on T013.
- US3 can start as soon as T004/T005/T013 exist — doesn't need to wait for US2's routes/UI (T014–T017) or for US1 at all.
- US5 can start as soon as T006/T019 exist — doesn't need US2's UI or US4.

---

## Parallel Example: Right after Foundational (T002–T006) completes

```bash
# Two independent tracks, no shared files:
Track A (US1): T007 → T008 + T009 (parallel) → T010 → T011
Track B (US2): T012 (parallel with Track A) → T013 → T014 + T015 (parallel) → T016 → T017 → T018
```

---

## Implementation Strategy

### MVP scope: US1 alone

Unlike spec 004, **US1 here is genuinely deployable by itself** — with zero `quota_targets` rows, every combination is simply "unavailable" (strictly safer than today's 50/50 random mock, never worse). Ship T001–T011 first; the admin panel (US2+) is what makes the quota data actually useful, but its absence doesn't corrupt anything.

### Incremental Delivery

1. T001–T006 (Setup + Foundational) → table + catalog fixes exist.
2. T007–T011 (US1) → real (if empty) quota gate live in the bot. **Deploy.**
3. T012–T018 (US2) → admins can populate/edit targets. **Deploy** — US1's behavior improves automatically as rows are added, no redeploy needed.
4. T019–T022 (US3) → bulk-load the real 132-row Excel in one shot instead of manual entry.
5. T023–T024 (US4), T025–T028 (US5) → independent, ship in either order or in parallel.
6. T029–T032 (Polish).

---

## Notes

- [P] tasks touch different files with no unmet dependency.
- Commit per phase checkpoint (e.g., T002–T006 as one commit, T007–T011 as another).
- Re-run the relevant test file after each task, not just at phase checkpoints — this feature has more moving parts than 004.
