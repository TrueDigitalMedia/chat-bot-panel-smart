---

description: "Task list template for feature implementation"
---

# Tasks: Chat web (nuevo canal)

**Input**: Design documents from `/specs/012-web-chat-channel/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: Included — per repo convention (every prior spec in this project ships unit + e2e coverage for the behavior it adds/changes), and `quickstart.md` already defines the exact curl/browser scenarios each story must satisfy.

**Organization**: Tasks are grouped by user story (spec.md) to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3, US4)
- File paths are exact and repo-relative

## Path Conventions

Single Next.js project — `src/`, `tests/` at repository root (see plan.md § Project Structure for the full file list).

---

## Phase 1: Setup

**Purpose**: Isolated new utility with no dependencies on the rest of the feature.

- [X] T001 [P] Create `src/lib/web/session.ts`: `getOrCreateWebSessionId(request)` — reads the `web_session_id` cookie if present, otherwise generates a UUID v4; returns `{ sessionId, setCookie: boolean }` so callers know whether to emit a `Set-Cookie` header (`HttpOnly`, `Secure`, `SameSite=Lax`, `Max-Age` ≈ 63072000 — research.md R1) — implemented via `next/headers` `cookies()` (works in Route Handlers), no request param needed since it reads/writes cookies directly; returns `{ sessionId, isNew }`
- [X] T002 [P] Unit tests in `tests/unit/web-chat-session.test.ts`: generates a new UUID when the cookie is absent; reuses the existing value when present; the emitted `Set-Cookie` has the exact attributes from research.md R1 — 4 tests passing

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Without this, no message for channel `web` can ever be resolved to a lead or persisted — every user story depends on it.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T003 Update `src/lib/messaging/send.ts`: the `'web'` case in `sendText`, `sendVideo`, `sendInlineKeyboard`, `sendPhoneRequest`, `confirmPhoneSaved` no longer throws — falls through to the existing `logOut()` call at the end of each function (no external SDK call), per research.md R6/R7. `confirmLocationKeyboardRemoved` already handles `'web'` correctly — no change needed there. `sendLocationRequest`'s `'web'` case is intentionally left out of this task — implemented in US3 (T017) since it needs GPS-specific prompt/metadata.
- [X] T004 [P] Unit tests in `tests/unit/web-chat-send-adapter.test.ts`: each function touched by T003 no longer throws for `channel: 'web'` and calls `logConversationMessage` (mocked) with the right `direction`/`contentType`/`body` (depends on T003) — 5 tests passing

**Checkpoint**: A `web` lead can be resolved (T001) and any message sent to it persists instead of throwing (T003) — user story implementation can now begin.

---

## Phase 3: User Story 1 - Conversar con el bot desde una página web pública (Priority: P1) 🎯 MVP

**Goal**: A visitor can open a public page, with no account or app install, and complete the same qualification conversation already running on Telegram/WhatsApp.

**Independent Test**: Open the page with no prior cookie; the bot sends the same opt-in greeting a new Telegram user gets; answering advances through the flow exactly like the other channels (spec.md US1 AC1–AC3).

### Tests for User Story 1

- [X] T005 [P] [US1] e2e test in `tests/e2e/web-chat.spec.ts`: `GET /api/chat/web` on a fresh request (no cookie) returns `200`, sets `web_session_id`, and the first message in the response is the same opt-in greeting Telegram sends a new user (quickstart.md §1)
- [X] T006 [P] [US1] e2e test in `tests/e2e/web-chat.spec.ts`: bootstrapping then `POST { callbackData: 'optin:accept' }` advances the flow and returns the next expected message (quickstart.md §2) — plus 2 extra tests for the body-validation 400 cases

### Implementation for User Story 1

- [X] T007 [US1] Implement `GET /api/chat/web` in `src/app/api/chat/web/route.ts`: resolve/create the session (T001), `upsertLead('web', sessionId)`, and if the lead has zero `conversation_messages` rows call `handlePhase1(lead, '', undefined, correlationId)` to trigger the opening message (same empty-input call shape already used by the restart path in `flow-router.ts:66`); return the full message history per contracts/web-chat-api.md (depends on T001, T003)
- [X] T008 [US1] Implement `POST /api/chat/web` in the same route file: parse `{ text? | callbackData? }` from the body (`400` if neither/both present — `location` handling added in T018), build a `ChannelInbound` with `channel: 'web'`, `logConversationMessage` the inbound message, call `await routeMessage(lead, inbound, correlationId)` (synchronous — no `after()`, research.md R2), capture the pre-call timestamp and return only the `direction: 'out'` `conversation_messages` rows created after it (depends on T007)
- [X] T009 [US1] Add in-memory rate limiting to `POST /api/chat/web` (20 requests/60s keyed by session id), mirroring `src/app/api/webhooks/telegram/route.ts:9-25` (research.md R10) (depends on T008) — applied to GET too (not just POST) since GET can also create a lead/trigger the opening message; Principle I is endpoint-wide, not POST-only
- [X] T010 [P] [US1] Create `src/app/chat/page.tsx`: public server component (outside `/admin`, not matched by `middleware.ts`'s `matcher`) that renders the chat client component
- [X] T011 [US1] Create `src/app/chat/chat-window.tsx` (client component): on mount, call `GET /api/chat/web` to hydrate message history; render bubbles by `direction` (bot vs. visitor) and `contentType` (text vs. `keyboard` buttons from `meta.buttons`, per data-model.md); a text composer that `POST`s `{ text }`; button clicks `POST` `{ callbackData }`; append the returned messages to the list. Include the Tailwind styling for bubbles/composer/buttons in this same component (depends on T010, contracts/web-chat-api.md) — built with existing shadcn `Button`/`Input` components (matches login-form.tsx convention); verified live in browser end-to-end through D2 with real DB writes

**Checkpoint**: A first-time visitor can open `/chat` and complete a full conversation turn-by-turn — testable end-to-end independent of US2–US4.

---

## Phase 4: User Story 2 - Continuar la conversación al recargar o volver a la página (Priority: P1)

**Goal**: A visitor who reloads or reopens the page in the same browser resumes exactly where they left off, instead of restarting the opt-in.

**Independent Test**: Answer a couple of survey questions, reload, and confirm the chat shows the full history and waits for the next pending answer instead of resetting (spec.md US2 AC1).

### Tests for User Story 2

- [X] T012 [P] [US2] e2e test in `tests/e2e/web-chat.spec.ts`: bootstrap, answer 2 questions, call `GET /api/chat/web` again with the same session cookie, and assert the response includes every prior message with the opt-in NOT re-triggered a second time (quickstart.md §3)

### Implementation for User Story 2

- [X] T013 [US2] In `GET /api/chat/web` (T007), make explicit and test-covered that `handlePhase1(lead, '', ...)` only fires when the lead has zero prior `conversation_messages` rows — the guard that prevents re-sending the opening message on every reload (depends on T007)
- [X] T014 [US2] In `chat-window.tsx` (T011), hydrate from the `GET` response on every mount (not only on a visitor's very first-ever visit), so a reload always renders full history before accepting new input (depends on T011) — plus a small polish fix found during live browser testing: button clicks now send a `label` alongside `callbackData` so history re-renders the friendly text ("Inscribirme") instead of the raw `callback_data` ("optin:accept") after a reload

**Checkpoint**: Reloading or reopening the page mid-survey resumes at the exact pending question — verified independently of US3/US4.

---

## Phase 5: User Story 3 - Compartir ubicación durante la encuesta en el chat web (Priority: P2)

**Goal**: When the survey reaches the location-gate step, the visitor can grant browser geolocation (or fall back to typing it manually) and the bot continues exactly like it does with Telegram/WhatsApp GPS.

**Independent Test**: Reach the location step, grant geolocation, and confirm the bot proceeds with that location the same way it processes Telegram/WhatsApp GPS shares (spec.md US3 AC1); denying the permission falls into the existing manual department/municipio flow (AC2).

### Tests for User Story 3

- [X] T015 [P] [US3] Unit test in `tests/unit/web-chat-send-adapter.test.ts`: `sendLocationRequest`'s `'web'` case logs a message with `meta.type === 'location_request'` instead of throwing (depends on T017)
- [X] T016 [P] [US3] e2e test in `tests/e2e/web-chat.spec.ts`: reach the location-gate step, `POST { location: { latitude, longitude } }`, and assert the flow advances past the gate (quickstart.md §4) — drives the full opt-in→D1→D2→D3→phone→name→GPS sequence against the real dev DB + a real Nominatim reverse-geocode call

### Implementation for User Story 3

- [X] T017 [US3] Implement `sendLocationRequest`'s `'web'` case in `src/lib/messaging/send.ts`: web-appropriate prompt text (same "no native share button, type it or grant permission" framing as the non-Telegram branch) plus `logOut(to, 'text', prompt, { type: 'location_request' })` so the client can detect the request (research.md R5) (depends on T003)
- [X] T018 [US3] Extend `POST /api/chat/web`'s body parsing (T008) to accept `location: { latitude, longitude }` and forward it into `ChannelInbound.location` unchanged (depends on T008) — already implemented as part of T008 (the body-validation shape was built with all three fields from the start)
- [X] T019 [US3] In `chat-window.tsx` (T011), detect `meta.type === 'location_request'` on the latest bot message and show a "Compartir ubicación" action that calls `navigator.geolocation.getCurrentPosition`, `POST`ing the coordinates on success; on denial/error/unsupported, leave the normal text composer available so the visitor can type their location, which already falls into the existing manual flow untouched (depends on T011, T017) — already implemented as part of T011

**Checkpoint**: A visitor can complete the GPS-gated part of the survey entirely from the browser — verified independently of US4.

---

## Phase 6: User Story 4 - Ver conversaciones del canal web en el panel admin (Priority: P3)

**Goal**: Web-channel leads and conversations are visible and filterable in the existing admin panel and dashboard, with no separate UI.

**Independent Test**: Complete a test conversation via the chat web, then confirm it appears in `/admin/conversations` and is filterable by channel `web` in `/admin/dashboard` (spec.md US4 AC1–AC2).

### Tests for User Story 4

- [X] T020 [P] [US4] Manual/e2e verification per quickstart.md §6: complete a web chat conversation (using T005–T019's flow) and confirm it shows up in `/admin/conversations` with channel `web`, and that `/admin/dashboard`'s channel filter (already includes a `web` option in `filters-form.tsx`) correctly narrows metrics to it — no code changes expected per data-model.md and spec.md's US4 assumption that both panels already render `channel` generically — verified live: `/admin/conversations` lists every test lead correctly labeled `WEB` (e.g. "Juana Pérez +50255551234 · WEB · F1·Q2·17 msgs" from the US3 e2e run) with correct last-message/phase/question progress; `/admin/dashboard?channel=web` renders with no errors and the "Canal" filter already has a "Web" option

### Implementation for User Story 4

- [X] T021 [US4] Audit `src/app/admin/conversations/`, `src/app/admin/dashboard/filters-form.tsx`, and `src/app/admin/dashboard/page.tsx` for any hardcoded Telegram/WhatsApp-only copy, icon, or logic that should also cover `web`; fix only if found (verification task — expected to require no changes) — confirmed no changes needed; both panels already render `channel` as a plain string with no per-channel branching, and the dashboard's channel `<select>` already lists Telegram/WhatsApp/Web

**Checkpoint**: All four user stories independently functional — a visitor can chat, resume, share location, and administrators see it all in the existing panel without any new admin surface.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Documentation and full-suite regression check after all stories land.

- [X] T022 [P] Update `docs/WIKI.md` with a new section documenting the web chat channel (session model, `/api/chat/web` contract summary, link to `specs/012-web-chat-channel`) — added §12, updated the index, "Última actualización" banner, and §11's Implementado list
- [X] T023 Run `yarn vitest run` and `yarn playwright test` for the full suite (not just web-chat tests) and fix any regressions — `yarn vitest run tests/unit/`: 167/167 pass (22 files, +10 from this feature). Playwright full suite: all 6 `web-chat.spec.ts` tests pass; 9 pre-existing failures unrelated to this feature — 3 in `admin-login.spec.ts` are a missing local Playwright browser binary (`chrome-headless-shell` not installed, confirmed via `browserType.launch: Executable doesn't exist`, nothing to do with any code), the other 6 (`phase-1-*`, `phase-4-discard`, `quota-check-real`) are the `TELEGRAM_WEBHOOK_SECRET` mismatch already confirmed pre-existing on `main` in the prior session (git-stash bisected)
- [X] T024 Execute `quickstart.md` end-to-end manually (curl sequence §1–§4, browser checklist §5, admin verification §6) and confirm every step passes — §1–§4 covered by the Playwright e2e suite (equivalent real requests); §5 driven live in the Browser pane through the actual opt-in→D1→D2→D3→phone→name→GPS-gate sequence, including clicking the real "📍 Compartir ubicación" button (headless env correctly triggers the error-fallback path, proving US3 AC2) and the "✍️ Escribir mi ubicación" button added during this verification to close a UX gap (gps-capture.ts's manual fallback requires the exact phrase "Escribir mi ubicación", which had no dedicated button before); §6 covered above in T020

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Setup (T001) — BLOCKS all user stories
- **User Story 1 (Phase 3)**: Depends on Foundational — no dependency on other stories; this is the MVP
- **User Story 2 (Phase 4)**: Depends on Foundational + T007/T011 (US1's `GET` route and client hydration, since it adds the "don't reset" guard to that same code)
- **User Story 3 (Phase 5)**: Depends on Foundational + T003/T008/T011 (US1's send-adapter pattern, POST body parsing, and chat window) — adds the location-specific branch to each
- **User Story 4 (Phase 6)**: Depends on a completed conversation existing (any of US1–US3) to verify against — otherwise touches no shared code
- **Polish (Phase 7)**: Depends on all four user stories being complete

### Within `src/app/api/chat/web/route.ts`

Built incrementally: T007 (`GET`, US1) → T008 (`POST` core, US1) → T009 (rate limit, US1) → T013 (no-reset guard, US2) → T018 (location body field, US3). Each addition is additive and doesn't change previously-passing behavior — same pattern as spec 011's `checkQuotaAvailability` build order.

### Within `src/app/chat/chat-window.tsx`

Built incrementally: T011 (message list + text/button turns, US1) → T014 (hydrate-on-every-mount, US2) → T019 (location-request detection + geolocation prompt, US3).

### Parallel Opportunities

- T001 and T002 can start immediately, in parallel with nothing else running yet.
- T004 (tests) can be written in parallel with T003 being implemented, though it needs T003 merged to actually pass.
- T005, T006 (US1 tests) in parallel with each other.
- T010 (`page.tsx`) can be built in parallel with T007–T009 (`route.ts`) — different files, only the contract needs to be stable.
- T015, T016 (US3 tests) in parallel with each other.
- T022 (WIKI update) can run in parallel with T023/T024.

---

## Parallel Example: User Story 1

```bash
# Tests, once Foundational is done:
Task: "e2e bootstrap test in tests/e2e/web-chat.spec.ts"
Task: "e2e opt-in-advance test in tests/e2e/web-chat.spec.ts"

# Independent files, once the API contract is stable:
Task: "Create src/app/chat/page.tsx"
Task: "Implement GET/POST in src/app/api/chat/web/route.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (session cookie helper)
2. Complete Phase 2: Foundational (send.ts no longer throws for `web`)
3. Complete Phase 3: User Story 1 — a visitor can open `/chat` and complete a full conversation
4. **STOP and VALIDATE**: run `tests/e2e/web-chat.spec.ts`'s US1 cases and `quickstart.md` §1–§2; confirm a fresh visitor gets the same opt-in a new Telegram user would
5. Deploy/demo if ready — this alone already opens recruitment to visitors without Telegram/WhatsApp

### Incremental Delivery

1. Setup + Foundational → foundation ready
2. US1 → test independently → deploy (MVP: chat works end-to-end)
3. US2 → test independently → deploy (reload/resume — closes the biggest continuity gap vs. Telegram/WhatsApp)
4. US3 → test independently → deploy (GPS gate — unblocks visitors who need geographic quota matching)
5. US4 → verify (expected zero new code) → confirm visibility in the existing admin panel
6. Polish → docs + full regression pass

### Sequencing Note

Unlike a fully independent multi-story feature, US2 and US3 each add a small, well-isolated branch to the same two files US1 creates (`route.ts`, `chat-window.tsx`) rather than new files — see "Within `route.ts`" / "Within `chat-window.tsx`" above. A second engineer can still work in parallel on US4's verification (needs only a completed conversation, not code changes) or on Polish's WIKI update while US2/US3 land.

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Commit after each task or logical group
- This feature requires no database migration (data-model.md: zero schema changes) — nothing to apply before implementation starts, unlike spec 011
- Stop at any checkpoint to validate a story independently before moving to the next
