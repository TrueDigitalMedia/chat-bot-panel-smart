---
description: "Task list for Web Chat Country Rooms implementation"
---

# Tasks: Web Chat Country Rooms

**Input**: Design documents from `/specs/016-web-chat-country-rooms/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: INCLUDED — the spec defines per-story Independent Test criteria and measurable outcomes
(SC-001/002/003 "100% / 0", SC-005 "zero behavior change"); quickstart lists specific unit + E2E
checks. SC-005 (existing flows unchanged) is proven by re-running the existing CAM golden-master
regression suite (Telegram) + the bare-`/chat` E2E — **no new `tests/regression/` journey**.

**Branch**: `feature/ecuador-mexico`

**Hard dependency**: features `014-ecuador-onboarding` + `015-mexico-onboarding` (the `CountryConfig`
registry, `conversation/survey-plan.ts` module, and the Ecuador/México questionnaires) and
`012-web-chat-channel` (the `/chat` page, `web_session_id`, `processChatTurn`). Phase 2 T003
gate-checks 014/015. **016 owns the `survey-plan.ts` skip additions (T006) — 014 does not build
them.** If a room targets a country whose `CountryConfig` is absent, the room degrades to generic
(FR-007) — so 016 is expected to land after 014/015.

## Path Conventions

Single `src/` web-app tree. New: `src/app/chat/[room]/`, `src/lib/web/chat-rooms.ts`,
`src/app/admin/rooms/`. One migration `0017_web_chat_rooms.sql` (numbered after 014's `0015` and
015's optional `0016`). Tests under `tests/unit/` and `tests/e2e/`.

---

## Phase 1: Setup

- [X] T001 Implement `src/lib/web/chat-rooms.ts` per `contracts/chat-room-registry.md` — `CHAT_ROOMS = { ecuador: 'Ecuador', mexico: 'México' }`, `resolveRoom(slug)` (case-insensitive, accent-tolerant on input, returns canonical `CountryConfig` name or `null`, never throws), `roomUrl(country)` (`${env.APP_BASE_URL}/chat/<slug>`, relative fallback when unset), `listRooms()` → `[{ country, slug, url }]`
- [X] T002 [P] Unit test `tests/unit/chat-rooms.test.ts` — the mapping table in `contracts/chat-room-registry.md` (hits, misses, casing, `méxico` input, `../x` path-traversal → null), `roomUrl` with/without `APP_BASE_URL`, `listRooms()` returns exactly the 2 rooms

**Checkpoint**: Room registry exists and is covered.

---

## Phase 2: Foundational (BLOCKING — no user story can start until this is done)

**Purpose**: The new `nextQuestionToSend` helper in `survey-plan.ts` (016 owns it), the
`leads.acquisition_source` column + migration, and the CAM golden-master regression guarantee.

- [X] T003 Verify the 014 + 015 groundwork is present: `src/lib/countries/{types,registry}.ts`, `getCountryConfig`, `conversation/survey-plan.ts` with `resolveSurveyQuestions`, and the `Ecuador` + `México` configs. If absent, STOP and land `specs/014-ecuador-onboarding` (+ 015) first
- [X] T004 Add `leads.acquisition_source varchar(40)` to `src/lib/db/schema.ts` (`'web:room:Ecuador'` | `'web:room:México'` | `null`) per `data-model.md` §1.1
- [X] T005 Create migration `src/lib/db/migrations/0017_web_chat_rooms.sql` (`ALTER TABLE leads ADD COLUMN acquisition_source varchar(40);`) and apply it to the live Neon dev branch in the same change (per memory: migrations must be applied, not just committed). No backfill
- [X] T006 Add `nextQuestionToSend(questions, fromIndex, answered, geoLabels)` to `src/lib/conversation/survey-plan.ts` (created by feature 014; **016 owns this helper** — do not wait for a 014 task), per `contracts/survey-preanswered-skip.md`. Skip rule 1: a question whose `fieldName` already has a non-null value on `survey_profiles` (today: only `country`, set by a room). Skip rule 2: a geo question (`stateProvince`/`municipality`/`neighborhood`) whose `getCountryConfig(country).geoHierarchy` label is `null` (CAM's `neighborhood`). Transitive; returns `{ index, skipped[] }`. **`resolveSurveyQuestions` is unchanged — the list length and every position stay the same, so in-flight `survey_question_index` values remain valid (no data migration).**
- [X] T007 Delete the copy-pasted `neighborhood` skip from `src/lib/conversation/send-survey-question.ts`, `src/lib/geo/handle-confirm.ts`, `src/lib/conversation/phases/phase-1.ts`, and `src/lib/conversation/gps-capture.ts`; route each "advance to next question" site through `nextQuestionToSend`. Behavior for CAM is byte-identical (rule 2 reproduces the Q5-hidden sequence + index progression). **Coordinate merge order with 014** — 016's T006 supersedes 014's send-time backstop; if 016 lands first, 014 T011 must not re-add a `neighborhood` skip
- [X] T008 In `src/lib/conversation/gps-capture.ts`, make `needsGpsCapture(lead)` return `false` when `survey_profiles.country` is already set (room leads enter geo manually — research R4)
- [X] T009 [P] Unit test `tests/unit/survey-preanswered-skip.test.ts` — Ecuador geo labels + nothing pre-answered → returns `fromIndex`; `country` pre-answered at index 2 → returns 3, `skipped: ['country']`; CAM geo labels (`neighborhoodLabel === null`) reaching position 5 → returns 6, `skipped: ['neighborhood']`; both together → transitive; everything remaining skipped → `length + 1`
- [X] T010 Run `npm run test:regression` and confirm **zero snapshot changes** in the CAM golden-master suite (Telegram, baseline from 014 T004a) after T006–T008 — this proves the `survey-plan.ts` change is a no-op for existing flows (SC-005 gate). The bare-`/chat` "still asks country" behavior is checked separately by the Playwright E2E in T016 (no new `tests/regression/` journey needed)

**Checkpoint**: Skip refactor done, CAM golden-master provably unchanged, DB ready. User stories can proceed.

---

## Phase 3: User Story 1 — Visitor lands on a country room and is never asked their country (P1)

**Goal**: A fresh visitor on `/chat/ecuador` or `/chat/mexico` is scoped to that country; the country
question is never shown; the flow runs that country's 014/015 questionnaire.

**Independent Test**: Open the Ecuador room URL in a fresh browser; confirm the conversation's country
is Ecuador, the country question never appears, the questionnaire is the Ecuador one; repeat for
Mexico; confirm bare `/chat` still asks.

- [X] T011 [P] [US1] Create `src/app/chat/[room]/page.tsx` — server component: `resolveRoom(params.room)`; hit → render the **same layout and copy as `src/app/chat/page.tsx`** with `<ChatWindow roomSlug={params.room} />` (no per-market intro copy — FR-010); miss → render the generic layout (no slug). Never `notFound()` / 404 (FR-007)
- [X] T012 [US1] Modify `src/app/chat/chat-window.tsx` — add optional `roomSlug?: string` prop; when set, the bootstrap `GET /api/chat/web` URL becomes `/api/chat/web?room=${roomSlug}`. `POST` turns unchanged
- [X] T013 [US1] Modify `GET` in `src/app/api/chat/web/route.ts` per `contracts/web-bootstrap-room-param.md` branch 3 — when `?room=` present AND `existing.length === 0` AND `survey_profiles.country` is null: `country = resolveRoom(slug)`; if resolvable AND `getCountryConfig(country)` has a real config → `UPDATE survey_profiles SET country`, `UPDATE leads SET acquisition_source = 'web:room:'||country`, log `web_room_entry {outcome:'applied'}`, **before** `handlePhase1`; response shape unchanged
- [X] T014 [US1] In the same handler, branch 3 degrade path (FR-007) — `resolveRoom` miss OR config absent → log `web_room_entry {outcome:'degraded', slug}`, do NOT set country, fall through to normal flow (country question will be asked)
- [X] T015 [P] [US1] Unit/route test `tests/unit/chat-web-room-param.test.ts` — stubbed DB + `getCountryConfig`: branch 3 applied (country + source + log), branch 3 degrade (unknown slug, unconfigured country), response shape unchanged
- [X] T016 [US1] E2E `tests/e2e/chat-country-room.spec.ts` (part 1) — fresh browser `/chat/ecuador` → after consent, name asked, **country question never shown**, next question is the first Ecuador geo question; DB shows `survey_profiles.country='Ecuador'`, `leads.acquisition_source='web:room:Ecuador'`, `channel='web'`; repeat `/chat/mexico` → `'México'` + Mexico geo wording; bare `/chat` → country question IS shown with all buttons

**Checkpoint**: An Ecuador/Mexico room visitor completes onboarding without the country question.

---

## Phase 4: User Story 2 — Returning visitor stays in their room (P1)

**Goal**: An existing conversation is never re-scoped by a room URL or the bare URL; reopening never
restarts or re-sends the opening message. A room visitor can still correct their pre-set country.

**Independent Test**: Start a conversation in the Ecuador room, answer a few questions, reload the
room URL and separately the bare `/chat` URL; the transcript and country are preserved, no opening
message re-sent. Separately: correct the country mid-flow and confirm the flow follows the corrected
country while `acquisition_source` stays `web:room:Ecuador`.

- [X] T017 [US2] In `GET` `src/app/api/chat/web/route.ts` implement `contracts/web-bootstrap-room-param.md` branch 2 — `?room=` present but `existing.length > 0` OR `survey_profiles.country` already non-null → ignore `room`, write nothing, log `web_room_entry {outcome:'existing_lead_ignored'}`, continue existing behavior (resume transcript, no opening message). Verify idempotency: a second `GET ?room=ecuador` on a now-scoped brand-new lead hits branch 2 and no-ops
- [X] T017a [US2] Verify the mid-conversation correction flow (feature 013) works for a room-set country: a room lead can change `country` via `tryHandleCorrectionRequest` / `questionIndexForField`; `survey_profiles.country` updates, the flow continues with the corrected country's `resolveSurveyQuestions`, and `leads.acquisition_source` is left unchanged (`web:room:<original>`). Add a guard if the correction-flow code assumes `country` was user-answered
- [X] T018 [P] [US2] E2E `tests/e2e/chat-country-room.spec.ts` (part 2) — (a) in-progress Ecuador-room conversation → reopen `/chat/ecuador` → transcript resumes, country still Ecuador; (b) same conversation → open bare `/chat` → still Ecuador, no re-scope, no opening message; (c) generic-`/chat` conversation that already answered country=Guatemala → open `/chat/mexico` → NOT re-scoped, stays Guatemala, `existing_lead_ignored` logged; (d) Ecuador-room lead corrects country → Guatemala → flow follows Guatemala, `acquisition_source` still `web:room:Ecuador`

**Checkpoint**: Room scoping applies only at creation; existing conversations are inviolate; correction still works.

---

## Phase 5: User Story 3 — Recruiter/admin gets the room links (P2)

**Goal**: Admins can see and copy the canonical Ecuador/Mexico room URLs, and can see which leads
came from which room.

**Independent Test**: In the admin area, view the country-rooms list with full URLs and a copy action,
open a copied link, confirm it lands on the right room; in the leads view, confirm room-originated
leads show their `acquisition_source`.

- [X] T019 [US3] Create `src/app/admin/rooms/page.tsx` — server component: `listRooms()` → a table of country / URL / `<CopyLink url={…} />`; show a note when `APP_BASE_URL` is unset (URLs are relative). Add `src/app/admin/rooms/copy-link.tsx` — client copy-to-clipboard button
- [X] T020 [US3] Add a "Salas" nav item to `src/app/admin/admin-sidebar.tsx` linking to `/admin/rooms`
- [X] T021 [US3] Surface `leads.acquisition_source` in the admin leads view (`src/app/admin/leads` / `src/lib/dashboard/`) — a column and/or a filter ("room: Ecuador" / "room: México" / "generic") so the research team can attribute room-originated web leads (SC-006). If a leads-list query builder exists, add `acquisition_source` to its select + filter set
- [X] T022 [P] [US3] E2E/integration test `tests/e2e/admin-rooms.spec.ts` — `/admin/rooms` lists Ecuador + México with `/chat/<slug>` URLs and a copy control; a copied URL opens the correct room; the leads view shows/filters by `acquisition_source` for a room-originated lead

**Checkpoint**: Research team can obtain the correct room link unaided (SC-004).

---

## Phase 6: Polish & Cross-Cutting

- [X] T023 [P] Verify the `web_room_entry` structured log for a room run against `quickstart.md` §9 — outcomes `applied`, `existing_lead_ignored`, `degraded` all observed; fields `session_id_hash`, `slug`, `resolved_country`, `outcome` present (Principle II)
- [X] T024 Run `npx vitest run` + `npx playwright test` + `npm run test:regression` full suites; confirm SC-005 zero-diff (bare `/chat` via E2E, Telegram via CAM golden-master, WhatsApp unchanged) and all new tests green
- [X] T025 [P] Update `specs/016-web-chat-country-rooms/quickstart.md` if any script/route names differ from the repo
- [X] T026 Self-review against the Constitution Check in `plan.md` (v1.2.0) — confirm the slug→country map is the only new country branch, `web_room_entry` + `acquisition_source` cover Principle II, the `survey-plan.ts` change is a no-op for existing flows (Principle V / FR-012)

---

## Dependencies & Execution Order

- **Features 014 + 015** → hard prerequisite (T003 gate-checks the registry + `survey-plan.ts` + EC/MX configs). **016 owns the `survey-plan.ts` additions in T006** — 014 does not build them.
- **Phase 1 (Setup)** → no dependencies; T001 then T002.
- **Phase 2 (Foundational)** → depends on Phase 1 + 014/015. BLOCKS all user stories. T004→T005 sequential; T006→T007→T008 sequential; T009 after T006; T010 last (re-runs the CAM golden-master after T006–T008).
- **US1 (Phase 3)** → depends on Phase 2. T011 (route) ∥ T012 (widget); T013→T014 sequential (same handler); T015 after T013/T014; T016 last.
- **US2 (Phase 4)** → depends on Phase 2 + T013 (shares the `GET` handler). T017 after T013; T017a after T006 (needs the resolved-list + skip); T018 after T017/T017a.
- **US3 (Phase 5)** → T019/T020 depend on Phase 1 (T001 `listRooms`); **T021 depends on Phase 2 T004/T005** (the `acquisition_source` column). Independent of US1/US2 otherwise.
- **Polish (Phase 6)** → after all targeted stories.

## Parallel Opportunities

- Phase 1: T002 after T001.
- Phase 2: T009 alongside T007/T008 (different file); T010 is the gate, runs last.
- After Phase 2: **US1 and US3 (T019/T020) can be built in parallel**. US2 waits on US1's T013.
- Within US1: T011 ∥ T012 ∥ T015 (different files). Within US3: T019 ∥ T021 (T021 also needs T004/T005).

## Implementation Strategy

- **MVP = Phase 1 + Phase 2 + US1 + US2** (both P1). This delivers working `/chat/ecuador` and
  `/chat/mexico` rooms that skip the country question and never re-scope an existing conversation.
  US3 (admin link list + attribution) is operational convenience — a documented URL convention is a
  usable stopgap.
- **T006 is a shared refactor.** It adds `nextQuestionToSend` to `survey-plan.ts` (skips answered
  fields + null-geo-label questions) and lets T007 delete the 4 copy-pasted `neighborhood` skips. The
  question list is unchanged, so no `survey_question_index` migration. **014 does not do this** — its
  send-time backstop keeps working until 016 lands; coordinate merge order so T007 removes it cleanly.
- Ship after 014/015: Phase 2 (CAM golden-master proves the `survey-plan.ts` change is a no-op) →
  US1 → US2 → US3.
- This feature adds **no new conversational LLM surface** and **no new consent path** — the opt-in
  gate still runs for room visitors (FR-010).
