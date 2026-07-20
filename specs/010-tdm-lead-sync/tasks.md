---

description: "Task list template for feature implementation"
---

# Tasks: Sync de Leads a TDM (Solo Escritura)

**Input**: Design documents from `/specs/010-tdm-lead-sync/`

**Prerequisites**: [plan.md](plan.md) (required), [spec.md](spec.md) (required for user stories), [research.md](research.md), [data-model.md](data-model.md), [contracts/](contracts/)

**Tests**: Included — spec.md's Testing section (via plan.md) explicitly calls for `field-map.test.ts` (pure, no mocks) and `sync.test.ts` (mocked I/O boundary).

**Organization**: Tasks are grouped by user story (spec.md priorities P1/P2/P3) to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)
- Exact file paths are included in every description

## Path Conventions

Single Next.js project — all paths are under `src/` at the repository root, matching [plan.md](plan.md) Project Structure.

---

## Phase 1: Setup

**Purpose**: Add the one new runtime dependency this feature needs

- [X] T001 Add `mysql2` as a runtime dependency (`npm install mysql2`), confirming it lands in `package.json` `dependencies` (see [research.md](research.md) R1 — no additional `@types` package needed, `mysql2` ships its own types)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Schema, types, config, and shared module scaffolding that every user story depends on

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T002 [P] Create Postgres migration `src/lib/db/migrations/0013_tdm_mysql_sync.sql` adding `tdm_lead_id INTEGER`, `tdm_sync_status VARCHAR(20)`, `tdm_last_sync_at TIMESTAMPTZ` to `leads` (all `ADD COLUMN IF NOT EXISTS`), per [data-model.md](data-model.md) §1
- [X] T003 [P] Add `tdmLeadId`, `tdmSyncStatus`, `tdmLastSyncAt` columns to the `leads` table definition in `src/lib/db/schema.ts` (plain `integer`/`varchar`/`timestamp`, no new `pgEnum` — matches the `flowStates.gpsGateStatus` convention per [data-model.md](data-model.md) §1)
- [X] T004 [P] Add `tdmLeadId: number | null`, `tdmSyncStatus: string | null`, `tdmLastSyncAt: Date | null` to the `Lead` interface, and add the missing `nseRegion: string | null` field to the `SurveyProfile` interface, in `src/types/lead.ts` (the `nseRegion` gap is pre-existing — present in `schema.ts`/DB but absent from this type — see [data-model.md](data-model.md) §2b)
- [X] T005 [P] Add `CLIENT_MYSQL_SYNC_ENABLED` (`z.coerce.boolean().default(false)`), `CLIENT_MYSQL_HOST`, `CLIENT_MYSQL_PORT` (`z.coerce.number().default(3306)`), `CLIENT_MYSQL_USER`, `CLIENT_MYSQL_PASSWORD`, `CLIENT_MYSQL_DATABASE`, `CLIENT_MYSQL_TENANT_ID`, `CLIENT_MYSQL_LEAD_VERSION`, `CLIENT_MYSQL_SSL_CA` (all `.optional()` except the two with defaults) to the `envSchema` in `src/lib/env.ts`, plus `isClientMysqlConfigured()` (host/user/password/database all set) and `isClientMysqlSyncEnabled()` (`env.CLIENT_MYSQL_SYNC_ENABLED && isClientMysqlConfigured()`) exported helpers, mirroring `isMetaWhatsAppConfigured()`/`isTwilioConfigured()` in the same file
- [X] T006 [P] Replace the `CLIENT_MYSQL_*` placeholder block (lines 18-27) in `.env.example` with the finalized variable list from T005, dropping `CLIENT_MYSQL_LEADS_TABLE`/`CLIENT_MYSQL_CODE_COLUMN` (no longer configurable — table/column names are now fixed to the real DDL)
- [X] T007 [P] Create `src/lib/tdm-mysql/types.ts` exporting `TbLeadsAgenteIaRow`, a partial type covering only the columns this feature writes, per the full column list in [data-model.md](data-model.md) §2
- [X] T008 Create `src/lib/tdm-mysql/client.ts` exporting `getClientMysqlPool()` (lazy singleton `mysql2/promise` pool: `connectionLimit: 1, waitForConnections: true, connectTimeout: 5000, enableKeepAlive: false`, optional `ssl: { ca: env.CLIENT_MYSQL_SSL_CA }` when set) and re-exporting `isClientMysqlConfigured`/`isClientMysqlSyncEnabled` from `src/lib/env.ts` for convenient module-local imports (depends on T005; see [research.md](research.md) R2 and [contracts/tdm-mysql-sync-module.md](contracts/tdm-mysql-sync-module.md))
- [X] T009 [P] Create `src/lib/tdm-mysql/field-map.ts` with the two shared pure helpers: `mapCoarseStatus(leadStatus: LeadStatus): string` (bucket table in [data-model.md](data-model.md) §3) and `mapShoppingCategories(ids: number[] | null): string | null` (id→label join using the exact Q14 list in `src/lib/conversation/survey-questions.ts`, unknown ids dropped, `null`/empty → `null`)

**Checkpoint**: Foundation ready — schema, types, config, and shared mapping primitives exist. User story implementation can now begin.

---

## Phase 3: User Story 1 - TDM recibe el lead apenas pasa cupo en Fase 1 (Priority: P1) 🎯 MVP

**Goal**: The instant a lead completes Phase 1's survey with quota available, a consolidated row appears in TDM's `tb_leads_agente_ia`, and the assigned id is saved back locally so later updates can target it.

**Independent Test**: Complete the Fase 1 survey for a lead that falls within quota (with `CLIENT_MYSQL_SYNC_ENABLED=true` and mocked MySQL in tests, or a real dev DB manually) and verify a row is written with contact/geo/scoring fields, and that `leads.tdmLeadId` gets populated locally.

### Tests for User Story 1

- [X] T010 [P] [US1] Add test cases to `src/lib/tdm-mysql/field-map.test.ts` for `mapCoarseStatus` (every bucket in [data-model.md](data-model.md) §3), `mapShoppingCategories` (known ids, an unknown id, `null`/empty input), and `buildPhase1InsertRow` (every column in [data-model.md](data-model.md) §2a/§2b, plus the §2e deliberately-`NULL` columns)
- [X] T011 [P] [US1] Add test cases to `src/lib/tdm-mysql/sync.test.ts` for `syncLeadPhase1Complete`: sync disabled → no-op `true` without touching the mocked pool; sync enabled + mocked `execute()` success → row shape asserted, `leads.tdmLeadId`/`tdmSyncStatus`/`tdmLastSyncAt` written via mocked `db`; mocked `execute()` throws → returns `false`, `logCall` called with `error`, no exception escapes (mock `@/lib/db/client`, `@/lib/tdm-mysql/client`, `@/lib/env` per the established pattern in `tests/unit/ficha-hogar-validation.test.ts`)

### Implementation for User Story 1

- [X] T012 [US1] Implement `buildPhase1InsertRow(lead: Lead, profile: SurveyProfile): TbLeadsAgenteIaRow` in `src/lib/tdm-mysql/field-map.ts`, using `mapCoarseStatus`/`mapShoppingCategories` from T009 (depends on T007, T009)
- [X] T013 [US1] Implement `syncLeadPhase1Complete(leadId: string, correlationId: string): Promise<boolean>` in `src/lib/tdm-mysql/sync.ts`: no-op `true` if `!isClientMysqlSyncEnabled()`; no-op `true` if `leads.tdmLeadId` is already set (idempotency guard, [data-model.md](data-model.md) §4); else load the lead + survey profile, build the row via `buildPhase1InsertRow`, `INSERT` via the pool from T008, on success write back `tdmLeadId = insertId`, `tdmSyncStatus = 'synced'`, `tdmLastSyncAt = now()`; wrap all I/O in try/catch, log every attempt via `logCall({ callType: 'tdm_mysql_sync_phase1', ... })`, never throw, return `false` on any failure (depends on T008, T012)
- [X] T014 [US1] Add `finalizeQuotaPassedLead(lead: Lead, correlationId: string): Promise<void>` in `src/lib/scoring/quota.ts` that calls `syncLeadPhase1Complete(lead.id, correlationId).catch(() => {})` — the single shared helper both quota-passed call sites invoke, replacing the duplicated inline logic that would otherwise exist in two files (depends on T013)
- [X] T015 [US1] Call `finalizeQuotaPassedLead(lead, correlationId)` in `src/lib/geo/handle-confirm.ts`'s `persistSurveyFieldAndAdvance`, immediately after `transitionLead(lead.id, 'link_sent', 'survey_complete_quota_available', correlationId)` (~line 110), before `handlePhase2` runs (depends on T014)
- [X] T016 [US1] Call `finalizeQuotaPassedLead(lead, correlationId)` in `src/lib/conversation/phases/phase-1.ts`, at the equivalent `transitionLead(lead.id, 'link_sent', 'survey_complete_quota_available', correlationId)` call site (~line 303), before `handlePhase2` runs (depends on T014)

**Checkpoint**: User Story 1 is fully functional and independently testable — a lead passing Phase 1 with quota now syncs to TDM regardless of which of the two code paths it took.

---

## Phase 4: User Story 2 - TDM recibe el perfil completo al terminar Ficha Hogar (Priority: P2)

**Goal**: When a lead completes the Ficha Hogar questionnaire, TDM's existing row for that lead is enriched with household data — or, if no prior row exists, one is created so the data isn't lost.

**Independent Test**: Complete Ficha Hogar for a lead that already has `tdmLeadId` set from Phase 1 and verify the same TDM row is `UPDATE`d (not duplicated) with household fields; then complete Ficha Hogar for a lead with `tdmLeadId = NULL` and verify a fallback `INSERT` happens instead.

### Tests for User Story 2

- [X] T017 [P] [US2] Add test cases to `src/lib/tdm-mysql/field-map.test.ts` for `buildFichaHogarUpdateRow` covering every column in [data-model.md](data-model.md) §2c plus the refreshed §2a/§2b columns and populated `thread_summary`/`json_raw`
- [X] T018 [P] [US2] Add test cases to `src/lib/tdm-mysql/sync.test.ts` for `syncLeadFichaHogarComplete`: `tdmLeadId` set → mocked `execute()` called as an `UPDATE ... WHERE id = ?`; `tdmLeadId` null → mocked `execute()` called as an `INSERT`, and the returned `insertId` is written back to `leads.tdmLeadId`; sync disabled → no-op `true`; mocked error → returns `false`, no throw

### Implementation for User Story 2

- [X] T019 [US2] Implement `buildFichaHogarUpdateRow(lead: Lead, profile: SurveyProfile, fichaHogar: FichaHogarProfile, summary: string | null): TbLeadsAgenteIaRow` in `src/lib/tdm-mysql/field-map.ts` (depends on T012 for the shared §2a/§2b column logic it reuses)
- [X] T020 [US2] Implement `syncLeadFichaHogarComplete(leadId: string, correlationId: string, summary: string | null): Promise<boolean>` in `src/lib/tdm-mysql/sync.ts`: no-op `true` if sync disabled; build the row via `buildFichaHogarUpdateRow`; if `leads.tdmLeadId` is set, `UPDATE tb_leads_agente_ia ... WHERE id = ?`; else `INSERT` (fallback) and write the new `insertId` back as `tdmLeadId`; write `tdmSyncStatus`/`tdmLastSyncAt` on success either way; log via `logCall({ callType: 'tdm_mysql_sync_ficha_hogar', ... })`; never throw (depends on T019)
- [X] T021 [US2] Call `syncLeadFichaHogarComplete(lead.id, correlationId, summary).catch(() => {})` in `completeFichaHogar` in `src/lib/conversation/phases/phase-4.ts`, independently of `persistTreintaPanelist`'s result — these are unrelated side effects, so the TDM sync must not be gated on Treinta's outcome (depends on T020)

**Checkpoint**: User Stories 1 and 2 both work independently — Phase 1 sync and Ficha Hogar enrichment are both live.

---

## Phase 5: User Story 3 - TDM se entera cuando un lead se descarta en Ficha Hogar (Priority: P3)

**Goal**: When a lead is discarded on Ficha Hogar's Q1 (conflict of interest), TDM's row for that lead is updated to reflect the discard instead of staying silently stuck as "active."

**Independent Test**: Trigger the Q1 discard branch for a lead with an existing `tdmLeadId` and verify its TDM row is updated with `lead_status = 'ficha_hogar_descartado'` / `status = 'rejected'`, with household columns left `NULL`.

### Tests for User Story 3

- [X] T022 [P] [US3] Add test cases to `src/lib/tdm-mysql/field-map.test.ts` for `buildDiscardUpdateRow`: `status`/`lead_status` set to the discard values, all §2c household columns `NULL`
- [X] T023 [P] [US3] Add test cases to `src/lib/tdm-mysql/sync.test.ts` for `syncLeadFichaHogarDiscarded`: update-when-`tdmLeadId`-set / fallback-insert-when-null (same shape as T018), sync disabled → no-op, mocked error → returns `false` without throwing

### Implementation for User Story 3

- [X] T024 [US3] Implement `buildDiscardUpdateRow(lead: Lead, profile: SurveyProfile): TbLeadsAgenteIaRow` in `src/lib/tdm-mysql/field-map.ts` (depends on T012, reusing the same §2a/§2b logic with the discard `status`/`lead_status` override per [data-model.md](data-model.md) §2d)
- [X] T025 [US3] Implement `syncLeadFichaHogarDiscarded(leadId: string, correlationId: string): Promise<boolean>` in `src/lib/tdm-mysql/sync.ts`, following the same update-or-fallback-insert idempotency shape as `syncLeadFichaHogarComplete` (T020), logging via `logCall({ callType: 'tdm_mysql_sync_discard', ... })`, never throwing (depends on T024)
- [X] T026 [US3] Call `syncLeadFichaHogarDiscarded(lead.id, correlationId).catch(() => {})` in the Q1 (`conflictOfInterest`) discard branch of `handleFichaHogar` in `src/lib/conversation/phases/phase-4.ts` (~lines 126-140), immediately before `transitionLead(lead.id, 'ficha_hogar_descartado', 'ficha_hogar_conflict_of_interest', correlationId)` (depends on T025)

**Checkpoint**: All three user stories are independently functional — Phase 1 sync, Ficha Hogar enrichment, and discard notification are all live.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Full-repo verification and a final scan for the one cross-cutting constraint (no PII in logs) that spans every task above

- [X] T027 [P] Run `npx vitest run tests/unit` and `npx tsc --noEmit`; confirm all tests pass and the only `tsc` error is the pre-existing, unrelated one in `persist-eval.ts` (zero new errors), per [quickstart.md](quickstart.md) step 3
- [ ] T028 Manually run [quickstart.md](quickstart.md) steps 4 and 5 against local dev: drive a lead through Phase 1 → Ficha Hogar with sync left disabled (default), then again with `CLIENT_MYSQL_SYNC_ENABLED=true` but no host/user/password/database set — confirm zero behavior change and zero `tdm_mysql_sync_*` log lines in both cases (spec SC-003)
- [X] T029 [P] Review every `logCall({ ..., error: ... })` call added in `src/lib/tdm-mysql/sync.ts` (T013, T020, T025) and confirm the logged `error` string never includes a raw PII field value (name, email, phone, address) — stringify only the driver/network error, not the row payload — per spec 001's contract §5 constraint referenced in [plan.md](plan.md)'s Constitution Check

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Setup (T001) completion — BLOCKS all user stories
- **User Story 1 (Phase 3)**: Depends on Foundational completion — no dependency on US2/US3
- **User Story 2 (Phase 4)**: Depends on Foundational completion; reuses `buildPhase1InsertRow`'s §2a/§2b logic (T012) from US1, so build after US1 even though its own call site (`phase-4.ts`) is independent of US1's call sites
- **User Story 3 (Phase 5)**: Same relationship to US1 as US2 (reuses T012); independent of US2's `phase-4.ts` edits target a different branch of the same file, so do it after US2 to avoid a merge conflict, not because of a functional dependency
- **Polish (Phase 6)**: Depends on all three user stories being complete

### Within Each User Story

- Tests (marked, written first) → row-builder function → sync orchestration function → call-site wiring
- Each story's checkpoint is a fully working, independently testable increment

### Parallel Opportunities

- Within Foundational: T002, T003, T004, T005, T006, T007, T009 can all run in parallel (7 independent files); T008 must wait on T005
- Within each user story's Tests sub-phase: the `field-map.test.ts` task and `sync.test.ts` task can run in parallel (different files)
- T027 and T029 in Polish can run in parallel; T028 is a manual step best done last

---

## Parallel Example: Foundational Phase

```bash
# Launch together once T001 (Setup) is done:
Task: "Create migration 0013_tdm_mysql_sync.sql"
Task: "Add tdmLeadId/tdmSyncStatus/tdmLastSyncAt to leads in schema.ts"
Task: "Add matching fields to Lead + nseRegion to SurveyProfile in types/lead.ts"
Task: "Add CLIENT_MYSQL_* env fields + helpers in env.ts"
Task: "Update .env.example CLIENT_MYSQL_* block"
Task: "Create tdm-mysql/types.ts with TbLeadsAgenteIaRow"
Task: "Create tdm-mysql/field-map.ts with mapCoarseStatus + mapShoppingCategories"
# Then, once env.ts (above) lands:
Task: "Create tdm-mysql/client.ts pool singleton"
```

## Parallel Example: User Story 1

```bash
# Launch together:
Task: "field-map.test.ts cases for buildPhase1InsertRow/mapCoarseStatus/mapShoppingCategories"
Task: "sync.test.ts cases for syncLeadPhase1Complete"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001)
2. Complete Phase 2: Foundational (T002-T009) — CRITICAL, blocks all stories
3. Complete Phase 3: User Story 1 (T010-T016)
4. **STOP and VALIDATE**: Run the field-map/sync unit tests, then manually confirm a Phase-1-qualified lead produces a row in a mocked/dev TDM target and `tdmLeadId` is saved
5. This alone closes the spec 001 contract's core gap (TDM finally receives qualified leads) and is deployable on its own with `CLIENT_MYSQL_SYNC_ENABLED` still `false` in production until validated

### Incremental Delivery

1. Setup + Foundational → foundation ready
2. Add User Story 1 → test independently → this is the MVP (TDM starts receiving Phase-1-qualified leads)
3. Add User Story 2 → test independently → TDM's records get enriched with household data
4. Add User Story 3 → test independently → TDM's records reflect discards
5. Polish → full regression + manual disabled/unconfigured smoke test + PII-in-logs review

---

## Notes

- [P] tasks touch different files with no dependency on an incomplete task
- [Story] labels map every user-story-phase task back to spec.md's US1/US2/US3
- `field-map.ts` and `sync.ts` are each edited across all three stories — those edits are intentionally sequential (same file), even where the underlying logic is independent
- `phase-4.ts` is edited by both US2 (T021) and US3 (T026) in two different functions/branches — sequential to avoid a merge conflict, not a functional dependency
- Commit after each task or logical group
- Stop at any checkpoint to validate a story independently before continuing
