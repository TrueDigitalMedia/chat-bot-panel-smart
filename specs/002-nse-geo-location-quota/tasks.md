---
description: "Task list for NSE CAM Geo Location Quota implementation"
---

# Tasks: NSE CAM Geo Location Quota

**Input**: Design documents from `specs/002-nse-geo-location-quota/`

**Prerequisites**: plan.md ✅ | spec.md ✅ | research.md ✅ | data-model.md ✅ | contracts/ ✅ | quickstart.md ✅

**Tests**: Constitution requires lead-capture E2E before merge — include Playwright scenarios for geo gate. Unit tests for catalog lookup included (plan Testing). Full TDD suite not requested.

**Organization**: Tasks grouped by user story for independent implementation and delivery.

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Can run in parallel (different files, no shared dependencies)
- **[Story]**: Which user story this task serves (US1–US4)
- All tasks include exact file paths

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Catalog import tooling and env documentation for Nominatim.

- [X] T001 Create Excel→JSON import script in `scripts/import-cam-nse-excel.ts` that reads *Muestra Regiones NSE CAM.xlsx* and writes `data/geo/cam-nse-regions.json` per [data-model.md](data-model.md) shape (`version`, `source`, `countries[name][]`)
- [X] T002 [P] Run import (or hand-curate) to commit initial `data/geo/cam-nse-regions.json` covering all 7 CAM countries from the Excel
- [X] T003 [P] Document optional `NOMINATIM_BASE_URL` (and User-Agent policy) in `.env.example`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Schema, catalog API, messaging/types for location — MUST complete before any user story.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T004 Extend `survey_profiles` in `src/lib/db/schema.ts` with `nseRegion` (varchar), `geoSource` (varchar), `inQuotaGeo` (boolean) per [data-model.md](data-model.md)
- [X] T005 Extend `flow_states` in `src/lib/db/schema.ts` with `gpsGateStatus` (varchar) and `gpsProposal` (jsonb) per [data-model.md](data-model.md)
- [X] T006 Generate and apply Drizzle migration (e.g. `drizzle/0007_*.sql`) for the new columns via `npm run db:generate` / `npm run db:migrate`
- [X] T007 [P] Implement name normalization + `lookupNseRegion(country, stateProvince, municipality)` in `src/lib/geo/cam-nse-catalog.ts` loading `data/geo/cam-nse-regions.json`
- [X] T008 [P] Add Vitest unit tests for catalog hit/miss/normalization in `src/lib/geo/cam-nse-catalog.test.ts` (or `tests/unit/cam-nse-catalog.test.ts`)
- [X] T009 [P] Implement Nominatim reverse geocode in `src/lib/geo/reverse-geocode.ts` returning `{ country, stateProvince, municipality, neighborhood | null }` (no lat/lng persistence); honor `NOMINATIM_BASE_URL` + User-Agent
- [X] T010 [P] Extend Telegram types in `src/types/telegram.ts` with `request_location` on reply buttons and `location: { latitude, longitude }` on messages
- [X] T011 [P] Extend inbound channel types in `src/types/channel.ts` with ephemeral `kind: 'location'` payload (lat/lng in-memory only)
- [X] T012 Implement `sendLocationRequest` in `src/lib/telegram/send.ts` and expose via `src/lib/messaging/send.ts` per [contracts/telegram-location.md](contracts/telegram-location.md) (share location + “Escribir mi ubicación”; WhatsApp no-op/throw)
- [X] T013 Parse `message.location` in `src/app/api/webhooks/telegram/route.ts` and pass location into the conversation router / deferred handler
- [X] T014 [P] Add DB helpers to read/write `gpsGateStatus`, `gpsProposal`, and profile geo metadata fields in `src/lib/db/` (extend existing leads/profile update helpers as appropriate)

**Checkpoint**: Catalog lookup works in unit tests; DB columns exist; webhook can receive a location update; foundation ready for GPS gate stories.

---

## Phase 3: User Story 1 — Share GPS, confirm, continue when in NSE region (Priority: P1) 🎯 MVP

**Goal**: Before manual country questions, ask for GPS; reverse geocode; confirm place; on allowlist hit persist geo + `nseRegion` / `geoSource=gps_share` and continue (ask barrio only if missing).

**Independent Test**: Quickstart Scenario A — GPS inside catalog → confirm Sí → continue without EXIT_B; profile has `nseRegion` and `geoSource=gps_share`.

### E2E (constitution — lead capture path)

- [X] T015 [P] [US1] Add Playwright (or webhook-sim) E2E covering GPS-in-catalog path in `tests/e2e/nse-geo-gps-in.spec.ts` — mock reverse geocode + catalog hit; assert survey advances and profile fields set

### Implementation

- [X] T016 [US1] Implement GPS gate module in `src/lib/conversation/gps-capture.ts` (`needsGpsCapture`, `requestGps`, handle skip text “Escribir mi ubicación” → `skipped_manual`) mirroring `src/lib/conversation/phone-capture.ts`
- [X] T017 [US1] Implement GPS confirm UI helpers in `src/lib/geo/gps-confirm.ts` (summary text + `gps:yes` / `gps:no` inline keyboard) per [contracts/telegram-location.md](contracts/telegram-location.md)
- [X] T018 [US1] On inbound location while `awaiting_location`: call `reverse-geocode.ts`, require country+state+municipality for success, store `gpsProposal`, set `awaiting_confirm`, send confirm message (barrio “No identificado” if null) in `src/lib/conversation/gps-capture.ts`
- [X] T019 [US1] Handle `gps:yes` in flow: run `lookupNseRegion`; on **hit** write profile (`country`, `stateProvince`, `municipality`, `neighborhood` if present, `nseRegion`, `geoSource=gps_share`, `inQuotaGeo=true`), set `gpsGateStatus=done`, skip survey indices for country/state/municipality (and neighborhood if already set); if neighborhood null ask only that question — wire in `src/lib/conversation/flow-router.ts` and/or `src/lib/conversation/phases/phase-1.ts`
- [X] T020 [US1] Invoke GPS gate from survey flow immediately before the `country` question (after phone + fullName) in `src/lib/conversation/flow-router.ts` / `src/lib/conversation/phases/phase-1.ts` / `src/lib/conversation/send-survey-question.ts` as needed
- [X] T021 [US1] Emit structured logs for `gps_requested`, `gps_received`, `reverse_geocode_ok|fail`, `gps_confirm_yes`, `nse_allowlist_hit` (admin names only — no lat/lng in DB or production logs) via existing logging helpers

**Checkpoint**: Happy-path GPS → confirm → in-quota continue works independently (EXIT_B miss can stub until US2).

---

## Phase 4: User Story 2 — Confirmed GPS outside catalog → EXIT_B (Priority: P1)

**Goal**: After GPS confirm, allowlist miss sets `quota_exhausted`, sends EXIT_B, does not ask barrio.

**Independent Test**: Quickstart Scenario B — confirm out-of-catalog place → EXIT_B + `inQuotaGeo=false`.

### E2E

- [X] T022 [P] [US2] Add E2E for GPS-out-of-catalog in `tests/e2e/nse-geo-gps-out.spec.ts` — mock geocode to non-catalog muni; confirm Sí; assert EXIT_B and `leadStatus=quota_exhausted`

### Implementation

- [X] T023 [US2] On `gps:yes` allowlist **miss** in `src/lib/conversation/gps-capture.ts` (or shared allowlist helper): set `inQuotaGeo=false`, `transitionLead(..., 'quota_exhausted')`, send EXIT_B from `src/lib/conversation/exit-messages.ts`, do **not** ask neighborhood; clear/finish GPS gate
- [X] T024 [US2] Log `nse_allowlist_miss` with country/state/municipality names; ensure further messages do not continue survey while status is `quota_exhausted` (existing router terminal behavior)

**Checkpoint**: GPS miss path matches existing no-quota UX.

---

## Phase 5: User Story 3 — GPS fail/cancel/reject → manual geo + same allowlist (Priority: P2)

**Goal**: Skip GPS, geocode failure, or `gps:no` → full manual country→dept→muni→barrio; after municipality resolved, same NSE allowlist (miss → EXIT_B without requiring barrio; hit → continue).

**Independent Test**: Quickstart Scenarios C, D, E.

### E2E

- [X] T025 [P] [US3] Add E2E for skip-GPS manual in-catalog and out-of-catalog in `tests/e2e/nse-geo-manual.spec.ts`

### Implementation

- [X] T026 [US3] On geocode failure / cancel / “Escribir mi ubicación”: set `gpsGateStatus=skipped_manual`, clear `gpsProposal`, start manual `country` question in `src/lib/conversation/gps-capture.ts`
- [X] T027 [US3] Handle `gps:no` → same as skip (discard proposal, full manual) in GPS confirm callback handler
- [X] T028 [US3] After manual municipality is accepted (exact or post-fuzzy confirm), call `lookupNseRegion` in `src/lib/conversation/phases/phase-1.ts` and `src/lib/conversation/survey-capture.ts` (and correction path if it writes municipality): hit → set `nseRegion`, `geoSource=text_exact|text_fuzzy`, `inQuotaGeo=true`; miss → EXIT_B + `quota_exhausted` without requiring neighborhood
- [X] T029 [US3] Keep Guatemala fuzzy UX in `src/lib/geo/guatemala.ts` for manual GT typos; ensure allowlist (not `guatemala.json`) is the quota authority for all countries including GT

**Checkpoint**: Manual path enforces the same geographic quota as GPS.

---

## Phase 6: User Story 4 — Ops visibility (NSE region + geo source) (Priority: P3)

**Goal**: Conversation monitor/detail shows `nseRegion`, `geoSource`, `inQuotaGeo`.

**Independent Test**: Quickstart Scenario A/B — open `/conversations/[id]` and verify fields per [contracts/lead-geo-fields.md](contracts/lead-geo-fields.md).

### Implementation

- [X] T030 [P] [US4] Extend conversation detail query/DTO in `src/lib/db/conversation-messages.ts` (or related) to return `nseRegion`, `geoSource`, `inQuotaGeo`
- [X] T031 [US4] Show NSE region, geo source, and in-quota geo in `src/app/conversations/[id]/monitor.tsx` (Ubicación sidebar)
- [X] T032 [P] [US4] Optionally surface a compact indicator on `src/app/conversations/page.tsx` list (not required for V1 if detail is complete)

**Checkpoint**: Operators can audit geo quota without reading raw chat logs.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Validation, docs, regression.

- [X] T033 [P] Align country name mapping between Nominatim / survey buttons / catalog keys (e.g. “Rep. Dominicana” vs “República Dominicana”) in `src/lib/geo/cam-nse-catalog.ts` and/or `src/lib/geo/reverse-geocode.ts`
- [X] T034 Run and tick off [quickstart.md](quickstart.md) scenarios A–E against local Telegram + ngrok
- [X] T035 [P] Verify phone-capture, FAQ digression, and correction flows still work when GPS gate is idle (manual regression notes in PR)
- [X] T036 Confirm Phases 2–4 code paths unchanged (no IA Bloque 3 / Bloque 2 work) — scope check before merge

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies
- **Phase 2 (Foundational)**: Depends on Setup — **BLOCKS** all user stories
- **Phase 3 (US1)**: Depends on Foundational — MVP
- **Phase 4 (US2)**: Depends on US1 GPS confirm handler (extends miss branch)
- **Phase 5 (US3)**: Depends on Foundational + catalog; can start after T007; integrates with GPS skip from US1
- **Phase 6 (US4)**: Depends on profile fields written by US1–US3
- **Phase 7 (Polish)**: After desired stories complete

### User Story Dependencies

- **US1 (P1)**: After Foundational — MVP delivery
- **US2 (P1)**: After US1 confirm/allowlist wiring (shared handler)
- **US3 (P2)**: After Foundational; ideally after US1 skip path exists
- **US4 (P3)**: After at least US1 writes the new profile fields

### Parallel Opportunities

- T002/T003 after T001 script exists (or T003 anytime)
- T007, T008, T009, T010, T011 in parallel during Foundational (after schema T004–T006 if tests need DB — catalog tests need only T007)
- T015 E2E can be drafted in parallel with T016–T018 once contracts are stable
- T030/T032 [US4] can start once schema columns exist, even before UI polish

---

## Parallel Example: Foundational

```bash
# After T004–T006 migration applied:
Task: "Implement cam-nse-catalog.ts"
Task: "Implement reverse-geocode.ts"
Task: "Extend telegram.ts + channel.ts types"
```

## Parallel Example: User Story 1

```bash
Task: "E2E nse-geo-gps-in.spec.ts"
Task: "gps-confirm.ts UI helpers"
# Then sequentially: gps-capture → wire flow-router → logging
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1 Setup (catalog JSON)
2. Phase 2 Foundational
3. Phase 3 US1 (GPS in-quota)
4. **STOP** — validate Quickstart Scenario A
5. Then US2 (EXIT_B) before calling geo quota “done”

### Incremental Delivery

1. Setup + Foundational → catalog + schema ready  
2. US1 → GPS happy path demo  
3. US2 → quota enforcement complete for GPS  
4. US3 → parity on manual path  
5. US4 → ops monitor  
6. Polish → quickstart A–E  

### Suggested MVP scope

**US1 + Foundational + US2** (GPS hit and miss). US3/US4 follow immediately for production readiness.

---

## Notes

- Do not persist lat/lng on leads/profiles
- EXIT_B copy: reuse `src/lib/conversation/exit-messages.ts` — do not rewrite marketing text
- WhatsApp location: port stub only
- Commit after each task or logical group
- Next command after tasks: `/speckit-analyze` (optional) or `/speckit-implement`
