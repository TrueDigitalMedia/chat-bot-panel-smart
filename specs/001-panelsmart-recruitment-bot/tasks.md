---
description: "Task list for PanelSmart Recruitment Bot implementation"
---

# Tasks: PanelSmart Recruitment Bot (Telegram)

**Input**: Design documents from `specs/001-panelsmart-recruitment-bot/`

**Prerequisites**: plan.md ✅ | spec.md ✅ | research.md ✅ | data-model.md ✅ | contracts/ ✅

**Tests**: Not explicitly requested — no test tasks generated. Add `/speckit-tasks --tdd` to regenerate with TDD tasks.

**Organization**: Tasks grouped by user story for independent implementation and delivery.

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Can run in parallel (different files, no shared dependencies)
- **[Story]**: Which user story this task serves (US1–US6)
- All tasks include exact file paths

---

## Phase 1: Setup (Project Initialization)

**Purpose**: Bootstrap the Next.js project and install all dependencies.

- [X] T001 Initialize Next.js 15 App Router project with TypeScript strict mode enabled
- [X] T002 Install core dependencies: `ai @ai-sdk/anthropic @upstash/qstash @vercel/postgres drizzle-orm drizzle-kit zod`
- [X] T003 [P] Install dev dependencies: `vitest @vitejs/plugin-react-swc playwright @playwright/test` (use `@vitejs/plugin-react-swc` for Next.js+Vitest; do NOT use `@vitejs/plugin-react` which conflicts with Next.js transforms)
- [X] T004 [P] Configure Vitest with `vitest.config.ts` and path aliases matching `tsconfig.json`
- [X] T005 [P] Configure Playwright with `playwright.config.ts` targeting local dev server
- [X] T006 [P] Create environment variable schema with Zod validation in `src/lib/env.ts` (validates required env vars on startup: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `POSTGRES_URL`, `QSTASH_TOKEN`, `QSTASH_CURRENT_SIGNING_KEY`, `QSTASH_NEXT_SIGNING_KEY`, `ANTHROPIC_API_KEY`; optional `CLIENT_MYSQL_*` + `CLIENT_MYSQL_SYNC_ENABLED` for client MySQL sync — see T029)
- [X] T007 [P] Create `src/lib/db/client.ts` — initialize Drizzle ORM client using `@vercel/postgres`
- [X] T008 [P] *(Merged into T013)* — pgvector extension is enabled as the first statement in the initial Drizzle migration (see T013); no separate setup script needed

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before any user story can be implemented.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T009 Define `LeadStatus` enum and `Lead` TypeScript interfaces in `src/types/lead.ts`
- [X] T010 [P] Define `FlowState`, `PhaseNumber`, `QuestionKey` TypeScript types in `src/types/flow.ts`
- [X] T011 [P] Define Telegram `Update`, `Message`, `CallbackQuery` payload types in `src/types/telegram.ts`
- [X] T012 Define Drizzle ORM schema for all 6 tables in `src/lib/db/schema.ts`: `leads`, `survey_profiles`, `flow_states`, `re_engagement_schedules`, `faq_entries`, `system_call_logs` (note: `household_profiles` removed — all data is now in `survey_profiles`; include `vector(1536)` column on `faq_entries` and all constraints from `data-model.md`)
- [X] T013 Generate and apply initial database migration using `drizzle-kit generate` and `drizzle-kit migrate` — the first migration MUST include `CREATE EXTENSION IF NOT EXISTS vector` before any table DDL; output to `src/lib/db/migrations/`
- [X] T014 [P] Implement allowed-transitions map and `validateTransition(from, to)` function in `src/lib/state-machine/transitions.ts` (covers all 8 lead states from `data-model.md`)
- [X] T015 [P] Implement `src/lib/state-machine/index.ts` — `transitionLead(leadId, newStatus, reason)` that reads current status from DB, validates transition, writes new status atomically, and emits a structured log containing ALL 5 required fields: `{ lead_id, from_status, to_status, correlation_id, phase, timestamp }`
- [X] T016 [P] Implement Telegram webhook secret token validator in `src/lib/telegram/verify.ts` — compare `X-Telegram-Bot-Api-Secret-Token` header against `env.TELEGRAM_WEBHOOK_SECRET`
- [X] T017 [P] Implement Telegram outbound sender in `src/lib/telegram/send.ts` — `sendText(chatId, text)`, `sendVideo(chatId, fileIdOrUrl, caption?)`, `sendInlineKeyboard(chatId, text, buttons)` using `https://api.telegram.org/bot{TOKEN}/{method}`
- [X] T018 [P] Implement correlation ID generator in `src/lib/correlation.ts` — `generateCorrelationId(): string` (UUID v4)
- [X] T019 [P] Implement call logger in `src/lib/db/call-log.ts` — `logCall({ leadId, callType, model?, inputTokens?, outputTokens?, latencyMs, correlationId, error? })` writes to `system_call_logs` (renamed from `llm_call_logs` to accommodate both LLM calls and external HTTP calls like PanelSmart PATCH); update `src/lib/db/schema.ts` to use `system_call_logs` table name
- [X] T020 Implement lead upsert in `src/lib/db/leads.ts` — `upsertLead(chatId, username?)` creates lead on first contact or updates `last_activity_at`; initializes `FlowState` row for new leads
- [X] T021 Implement flow router in `src/lib/conversation/flow-router.ts` — `routeMessage(lead, messageText, correlationId)` dispatches to the correct phase handler based on `lead.lead_status`; calls FAQ handler first if message is a digression
- [X] T022 Implement Telegram webhook route in `src/app/api/webhooks/telegram/route.ts` — `POST` handler: validate secret token → extract `chat_id` + `text` → upsert lead → defer processing via `after()` → return `200 {}` immediately; deferred work calls `routeMessage()`

### AI Safety Controls (Constitution Principle I — NON-NEGOTIABLE)

- [X] T022a [P] Implement input sanitizer in `src/lib/ai/sanitize.ts` — `sanitizeInput(text: string): string`: strip control characters (null bytes, ANSI escapes), enforce max length (500 chars), reject known prompt injection patterns (e.g., "ignore previous instructions", role-switch commands); throw `InputRejectedError` for blocked inputs; log rejections via `logCall` with `callType='input_rejected'`
- [X] T022b [P] Implement output validator in `src/lib/ai/validate-output.ts` — `validateBotResponse(text: string): boolean`: reject outputs containing external URLs not in an allowlist (no arbitrary links in FAQ answers), reject outputs that echo back raw PII fields verbatim, reject empty strings; log validation failures; return `false` to trigger a safe fallback message
- [X] T022c [P] Implement prompt builder in `src/lib/ai/prompt-builder.ts` — `buildExtractionPrompt(userInput: string): string`: wraps user input in explicit delimiters (`<user_input>...</user_input>`), prepends a system instruction that prohibits the model from following instructions inside the user input block; ensures prompt injection resistance for all `generateObject` calls
- [X] T022d [P] Implement context window guard in `src/lib/ai/context-guard.ts` — `boundContext(history: Message[], maxTokens = 2000): Message[]`: truncates oldest messages first, preserves system prompt and last N user/assistant turns within the token budget; MUST be called before any LLM call that includes conversation history (Phase 4 summary, FAQ handler)

**Checkpoint**: Foundation ready. Every inbound Telegram message reaches the flow router through sanitized, injection-resistant, bounded-context AI calls. User story implementation can begin.

---

## Phase 3: User Story 1 — Intake Questionnaire & Qualification (Priority: P1) 🎯 MVP

**Goal**: A visitor starts a Telegram conversation, passes two hard filters, provides demographic data via free-text, and is either qualified (advances to Phase 2), disqualified, or waitlisted.

**Independent Test**: Start a Telegram conversation with the bot, exercise all 3 decision points and the 16-question survey, and verify `lead_status` and `survey_profiles` in the database match the expected outcome for each scenario in `quickstart.md` Scenarios 1a–4.

### E2E Tests for User Story 1 ⚠️ (Constitution requirement — MUST pass before merge to main)

> **Constitution Dev Workflow**: "Lead capture paths MUST have an end-to-end test before merging to main."

- [X] T023e2e [P] [US1] Write Playwright E2E test for disqualification path in `tests/e2e/phase-1-disqualify.spec.ts` — simulate webhook POST for T&C rejection and household-filter rejection; assert `lead_status = not_qualified` in DB and correct farewell message sent
- [X] T023e2e-b [P] [US1] Write Playwright E2E test for full qualification path in `tests/e2e/phase-1-qualify.spec.ts` — simulate D1→D2→D3→all 16 survey questions; assert `survey_profiles` fully populated (all 16 fields non-null), `score` set, `lead_status = link_sent`; cover quota-exhausted branch (survey complete, quota API returns 0 → EXIT_B + "🎉 ¡Gracias!")

### Implementation for User Story 1

- [X] T023 [P] [US1] Implement `SurveyProfile` Zod schema and free-text field extractor in `src/lib/ai/extract-survey-fields.ts`. Only the following fields require LLM extraction (others are captured from button callbacks directly): `full_name` (string), `state_province` (string), `municipality` (string), `neighborhood` (string), `email` (string, validated as email), `household_size` (positive integer), `bedrooms` (non-negative integer), `shopping_categories` (array of 1–8 integers parsed from text like "1,2,3,6"). Implement `extractField(fieldName, userText): Promise<{ ok: boolean; value?: unknown }>` using `generateObject`; call `sanitizeInput` before LLM; call `buildExtractionPrompt`; log via `logCall`; return `{ ok: false }` on error
- [X] T024 [P] [US1] Implement `calculateScore(profile: Pick<SurveyProfile, 'education_psh'|'cars'|'domestic_help'|'household_size'|'bedrooms'>): number` using the scoring algorithm provided by Treinta in `src/lib/scoring/socioeconomic.ts`; include `getQuotaSegment(score): string`
- [X] T025 [US1] Implement `checkQuotaAvailability(segment: string): Promise<boolean>` in `src/lib/scoring/quota.ts` — queries real-time quota data source (**confirm with Treinta before implementing**: Vercel Postgres table OR Google Sheets API; document decision in `research.md` Decision 7); on API timeout or error MUST fail closed (return `false`, log error, do NOT advance lead) — zero tolerance for quota race-condition escapes (SC-006)
- [X] T026 [US1] Implement Phase 1 handler in `src/lib/conversation/phases/phase-1.ts`. The handler reads `lead.survey_question_index` and `FlowState.decision_point` to know where to resume:
  - **D1** (index=0, d1): Send T&C inline keyboard ("Confirmo y acepto" / "No, gracias"). On "No, gracias" → `transitionLead(id, 'not_qualified')` + send EXIT_A message verbatim
  - **D2** (after D1): Send prizes inline keyboard ("Sí quiero" / "No, gracias"). On "No, gracias" → `transitionLead(id, 'not_qualified')` + send EXIT_A message verbatim
  - **D3** (after D2): Send shopper inline keyboard ("Sí" / "No"). On "No" → `transitionLead(id, 'quota_exhausted')` + send EXIT_B message verbatim
  - **Survey Q1–Q16** (index 1–16, after D3="Sí"): For each question send exact text from spec US1 table. Button fields: capture from `callback_query.data`. Free-text fields: call `extractField(fieldName, text)`; on `ok: false` → reply "Tuve un problema, ¿puedes repetirlo?" and retry on next message. After each confirmed answer: write field to `survey_profiles`, increment `survey_question_index` in `FlowState`
  - **After Q16**: `survey_profiles.completed_at = now()` → `calculateScore` → `checkQuotaAvailability`; if no quota → `transitionLead(id, 'quota_exhausted')` + send EXIT_B + "🎉 ¡Gracias por tus respuestas!"; if quota → advance to Phase 2
- [X] T027 [US1] Implement `GET /api/leads/[id]/route.ts` — returns lead status, current phase, score, and `last_activity_at`
- [X] T028 [US1] Implement `PATCH /api/leads/[id]/status/route.ts` — accepts `{ new_status, reason, metadata }`, calls `transitionLead`, returns `{ previous_status, new_status }` or `409` on invalid transition

**Checkpoint**: User Story 1 fully functional. The bot can qualify, disqualify, and waitlist visitors independently of Phases 2–4.

---

## Phase 4: User Story 2 — App Download & Registration Code Delivery (Priority: P2)

**Goal**: A qualified lead is upserted into **client MySQL**, receives iOS/Android download links, and after **download confirmation** receives the registration code read from MySQL (written by the client's internal process). See `contracts/client-mysql-integration.md`.

**Independent Test**: Simulate a qualified lead: MySQL sync → `link_sent` → download confirm → code lookup → `waiting_for_code`. See `quickstart.md` Scenario 5.

### Implementation for User Story 2

> **2026-07-17 contract change**: CreatePanelist/GPM and PanelSmart PATCH are **out**. Interim local mock (`MOCK-…` + timer) remains until MySQL tasks below ship.

- [ ] T029 [P] [US2] Implement client MySQL module in `src/lib/client-mysql/` — `pool.ts`, `map-lead-row.ts`, `sync-lead.ts` (`upsertQualifiedLead`), `fetch-panelist-code.ts`; log via `logCall` with `callType` `client_mysql_sync` / `client_mysql_code_lookup`; env: `CLIENT_MYSQL_*`, `CLIENT_MYSQL_SYNC_ENABLED`
- [X] T030 [US2] Implement QStash scheduler helpers in `src/lib/scheduler/re-engagement.ts` — `scheduleJob(leadId, phase, attemptNumber, delaySeconds, templateKey)` and `cancelPendingJobs(leadId, phase)` using `@upstash/qstash`; define cadence constants in `src/lib/scheduler/constants.ts` as a named map to avoid off-by-one indexing: `const REENGAGEMENT_DELAY_SECONDS: Record<1|2|3, number> = { 1: 4500, 2: 25200, 3: 72000 }` and `PHASE2_CODE_DELAY_SECONDS = 600`; ⚠️ T042 (US5) extends this same file — do NOT mark parallel with T042
- [X] T031 [US2] Implement Phase 2 handler in `src/lib/conversation/phases/phase-2.ts` (download links + `link_sent`). **Follow-up**: wire `upsertQualifiedLead` on qualify paths before Phase 2; replace mock store URLs when real links are provided.
- [ ] T032 [US2] Replace mock code delivery: on download confirmation, call `fetchPanelistCode` → send real code → `transitionLead(id, 'waiting_for_code')` → optional onboarding video. Keep `mock-registration.ts` only when `CLIENT_MYSQL_SYNC_ENABLED=false`.
- [ ] T032b [US2] Postgres migration on `leads`: `client_mysql_sync_status`, `client_mysql_synced_at`, `client_mysql_sync_error`, `panelist_code`, `panelist_code_fetched_at`

**Checkpoint**: User Story 2 functional with MySQL enabled: sync on qualify, links sent, code from MySQL after download confirm.

---

## Phase 5: User Story 3 — Registration Monitoring & Routing (Priority: P3)

> **Decision 8 (research.md)**: v1 uses **user confirmation buttons** after code delivery. Optional later: client webhook or MySQL status-column polling (`contracts/client-mysql-integration.md`).

**Goal**: After registration code delivery, the system routes leads to Phase 4 on success, human handoff on failure, or inactivity freeze after 20 hours.

**Independent Test**: Simulate the three outcomes (user confirm success, failure, 20h silence) and verify correct `lead_status` transitions and routing. See `quickstart.md` Scenario 8 (partial).

### Implementation for User Story 3

- [X] T033 [P] [US3] Registration outcome via user buttons + local webhook `src/app/api/webhooks/registration/route.ts` (dev/sim). Optional future: client webhook or MySQL status poll — not required for v1 MySQL code path.
- [X] T034 [US3] Implement Phase 3 handler in `src/lib/conversation/phases/phase-3.ts` — entry point called after `code_delivered_registered`; triggers Phase 4; also handles `code_delivered_not_registered` by sending human-handoff message
- [X] T035 [US3] Add 20-hour inactivity freeze to registration monitoring: after code is delivered, schedule a QStash job for 20 hours (`action: 'freeze_registration'`); in job handler, if `lead_status` is still `waiting_for_code` → `transitionLead(id, 'code_delivered_no_response')` (update `src/app/api/jobs/re-engage/route.ts`)
- [X] T036 [US3] Implement human handoff message in `src/lib/conversation/phases/phase-3.ts` — sends a message with support contact information when `code_delivered_not_registered` is set

**Checkpoint**: User Story 3 fully functional. All three registration paths route correctly. Human agents are only engaged for genuine technical failures.

---

## Phase 6: User Story 4 — Post-Registration Profile Confirmation (Priority: P4)

**Goal**: After successful PanelSmart registration, generate an AI summary of the completed Phase 1 survey and submit it to PanelSmart. Send the thank-you video and mark the panelist as fully onboarded. No additional data collection is required — all fields were captured in Phase 1.

**Independent Test**: Simulate a `code_delivered_registered` lead, verify the AI summary is generated from `survey_profiles` data, the thank-you video is sent, and `lead_status = ficha_hogar_completada`. See `quickstart.md` Scenario 8 (full).

### Implementation for User Story 4

- [X] T037 [P] [US4] Implement `summarizeSurveyProfile(leadId): Promise<string>` in `src/lib/ai/summarize-survey.ts` — loads the `survey_profiles` record, formats all 16 fields into a structured text summary, applies `boundContext` guard, calls LLM to generate a concise profile narrative; logs call via `logCall` with `callType='conversation_summary'`
- [X] T038 [US4] Implement Phase 4 handler in `src/lib/conversation/phases/phase-4.ts`:
  - Call `summarizeSurveyProfile(leadId)` and submit result to PanelSmart platform (POST or PATCH to configured endpoint)
  - Validate submission response
  - On success: `transitionLead(id, 'ficha_hogar_completada')` → `sendVideo` thank-you video
  - On submission failure: log error + send support redirect message
- [ ] T039 [US4] *(Anti-competition filter removed — not present in verified flow)*
- [ ] T040 *(Merged into T038)*

**Checkpoint**: User Story 4 fully functional. Registration confirmation and thank-you delivery complete the full recruitment funnel end-to-end.

---

## Phase 7: User Story 5 — Re-engagement on Inactivity (Priority: P5)

**Goal**: At any phase, if a user goes silent, three Telegram messages are sent at 75 minutes, 7 hours, and 20 hours. After 3 unanswered attempts, the lead is marked `abandono`.

**Independent Test**: Simulate inactivity at multiple phases using reduced cadence overrides and verify: 3 messages sent at correct intervals, `abandono` set after 3rd unanswered attempt, timers cancelled on user response. See `quickstart.md` Scenario 7.

### Implementation for User Story 5

- [X] T041 [P] [US5] Write re-engagement message copy for all 3 attempts in `src/lib/scheduler/messages.ts` — export `getReEngagementMessage(attemptNumber: 1 | 2 | 3): string` with pre-written Spanish-language text for each attempt
- [X] T042 [US5] Wire re-engagement scheduling into flow router in `src/lib/conversation/flow-router.ts` — on every inbound message: cancel any pending re-engagement jobs for this lead+phase via `cancelPendingJobs(leadId, currentPhase)`; after handling message, schedule first re-engagement job at 75 minutes via `scheduleJob(leadId, phase, 1, 4500, 're-engage-1')`
- [X] T043 [US5] Implement re-engagement job execution in `src/app/api/jobs/re-engage/route.ts` — when `action === 're-engage'`: validate lead is still inactive (check `last_activity_at`); if active → no-op; if inactive + `attemptNumber < 3` → `sendText(chatId, getReEngagementMessage(attemptNumber))` + increment `re_engagement_count` + schedule next attempt; if `attemptNumber === 3` → send final message → `transitionLead(id, 'abandono')`
- [X] T044 [US5] Add `cancellation` logging to `re_engagement_schedules` table — when `cancelPendingJobs` runs (user responded), set `outcome = 'cancelled'` on all open schedule rows for that lead+phase

**Checkpoint**: User Story 5 fully functional. Re-engagement cadence fires correctly, cancels on user response, and sets `abandono` after 3 unanswered attempts.

---

## Phase 8: User Story 6 — Out-of-Flow Message Handling (Priority: P6)

**Goal**: When a user sends a message that doesn't match the expected answer: (1) check FAQ bank, (2) if match → deliver FAQ answer then re-send pending question, (3) if no match → re-send pending question directly. In a terminal state or no active flow → send support redirect. This replaces the previous "FAQ RAG only" design with the verified demo behavior as primary path.

**Independent Test**: Send off-topic messages at different flow states (D1 stage, mid-survey, terminal), verify: FAQ answer delivered when relevant, pending question always re-sent, support redirect sent in terminal state. See `quickstart.md` Scenario 6.

### Implementation for User Story 6

- [X] T045 [P] [US6] Implement FAQ embedding generation in `src/lib/rag/embed.ts` — `embedText(text: string): Promise<number[]>` using Vercel AI SDK `embed()` with the same model used for search
- [X] T046 [P] [US6] Implement FAQ seed script in `src/lib/db/seed/faqs.ts` — reads FAQ source file (JSON/CSV provided by Treinta), generates embeddings for all 75 entries, bulk-inserts into `faq_entries` table; idempotent (skips existing entries by question hash)
- [X] T047 [US6] Implement pgvector cosine similarity FAQ search in `src/lib/rag/search.ts` — `findFaq(query: string): Promise<FAQEntry | null>`: embed query → `SELECT ... ORDER BY embedding <=> $1 LIMIT 1` with a minimum similarity threshold (e.g., 0.75); return null if below threshold
- [X] T048 [US6] Implement out-of-flow handler in `src/lib/conversation/faq-handler.ts` — `handleOutOfFlow(lead, query, correlationId)`:
  1. Check FAQ bank: if pre-filter passes (length > 15 chars, not a button callback, not "sí/no/ok") call `findFaq(query)` with similarity threshold ≥ 0.75
  2. If FAQ match found: validate answer with `validateBotResponse`; send FAQ answer; send transition message ("Continuemos donde lo dejamos 👉"); then re-send the pending question/buttons
  3. If no FAQ match OR pre-filter fails: re-send the pending question/buttons directly (no extra message)
  4. If lead is in a terminal state (`not_qualified`, `quota_exhausted`, `ficha_hogar_completada`, `abandono`) OR no survey started: send support redirect "Te invito a escribir a nuestro canal de atención en el {SUPPORT_CONTACT} para resolver tus dudas. Estoy aquí para ayudarte con tu inscripción cuando quieras."
  5. Log FAQ search call via `logCall` with `callType='faq_search'` (only when `findFaq` is actually called)
- [X] T049 [US6] Wire out-of-flow handler into flow router in `src/lib/conversation/flow-router.ts` — when an inbound message does NOT match the expected answer for the current `survey_question_index` or decision point: route to `handleOutOfFlow` instead of the phase handler; the phase handler is ONLY called when the input matches the expected format (button callback for button questions, any text for free-text questions)

**Checkpoint**: All 6 user stories independently functional. Full recruitment funnel working end-to-end.

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that apply across all user stories.

- [X] T050 [P] Add health endpoint `GET /api/health/route.ts` — returns `{ status: 'ok', db: 'connected', timestamp }` after a lightweight DB ping
- [X] T051 [P] Add readiness endpoint `GET /api/ready/route.ts` — checks env vars, DB connection, and QStash connectivity
- [X] T052 [P] Add rate limiting middleware to Telegram webhook handler in `src/app/api/webhooks/telegram/route.ts` — reject requests exceeding a threshold per `chat_id` (e.g., 20 messages/minute) with `429`
- [X] T053 [P] Add `npm run db:seed:faqs` script to `package.json` that runs `src/lib/db/seed/faqs.ts`
- [X] T054 [P] Add `npm run db:migrate` script to `package.json` that runs Drizzle migrations
- [ ] T055 Run all 8 quickstart.md validation scenarios; document any failures and fix
- [X] T056 [P] Write `README.md` covering: local dev setup, env var reference, Telegram webhook registration command, database setup commands, and deployment to Vercel

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 completion — **BLOCKS all user stories**
- **US1 (Phase 3)**: Depends on Foundational — no dependency on US2–6
- **US2 (Phase 4)**: Depends on Foundational + US1 (requires qualified lead)
- **US3 (Phase 5)**: Depends on US2 (requires code delivery to have happened)
- **US4 (Phase 6)**: Depends on US3 (requires successful registration)
- **US5 (Phase 7)**: Depends on Foundational — can be built in parallel with US1–4
- **US6 (Phase 8)**: Depends on Foundational — can be built in parallel with US1–5
- **Polish (Phase 9)**: Depends on all desired stories being complete

### Within Each User Story

- Models/types before services
- Services before route handlers
- Core implementation before integration with other stories
- Story complete and independently testable before moving to next priority

### Parallel Opportunities

- All Setup tasks marked [P] can run in parallel (T003–T008)
- All Foundational tasks marked [P] can run in parallel within Phase 2 (T010–T011, T014–T019)
- US5 (re-engagement) and US6 (FAQ) can be built in parallel with US1–4 since they only depend on Foundational
- Within each user story: tasks marked [P] can run in parallel

---

## Parallel Execution Examples

### Foundational Phase (after T012–T013 complete)

```
Parallel:
T014 state-machine/transitions.ts     T016 telegram/verify.ts
T015 state-machine/index.ts           T017 telegram/send.ts
                                       T018 correlation.ts
                                       T019 db/call-log.ts
Then sequential:
T020 db/leads.ts → T021 flow-router → T022 webhooks/telegram/route.ts
```

### User Story 1 (after Foundational complete)

```
Parallel:
T023 ai/extract-demographics.ts       T024 scoring/socioeconomic.ts
Then sequential:
T025 scoring/quota.ts → T026 phases/phase-1.ts → T027 leads/[id]/route.ts → T028 leads/[id]/status/route.ts
```

### After US1 complete — parallel tracks

```
Track A (US2→US3→US4): T029 → T030 → T031 → T032 → T033 → T034 → T035 → T036 → T037 → T038 → T039 → T040
Track B (US5):          T041 → T042 → T043 → T044
Track C (US6):          T045 → T046 → T047 → T048 → T049
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001–T008)
2. Complete Phase 2: Foundational (T009–T022) — CRITICAL GATE
3. Complete Phase 3: User Story 1 (T023–T028)
4. **STOP and VALIDATE**: Run quickstart.md Scenarios 1–4 independently
5. Deploy to Vercel staging and test with a real Telegram bot

### Incremental Delivery

1. Setup + Foundational → Bot receives messages and routes them
2. US1 → Bot can qualify, disqualify, and waitlist visitors (MVP!)
3. US2 → Qualified leads receive download links and registration code
4. US3 → Registration outcomes are handled correctly
5. US4 → Full funnel complete with household profiling
6. US5 → Inactive leads are re-engaged automatically
7. US6 → FAQ support works at any point in the flow

---

## Notes

- `[P]` tasks operate on different files with no incomplete shared dependencies
- `[USn]` label maps each task to a specific user story for traceability
- Each user story phase ends with a **Checkpoint** — validate independently before proceeding
- Scoring algorithm (`T024`) requires implementation details from Treinta
- FAQ source file (`T046`) must be provided by Treinta in JSON or CSV format before US6 begins
- Registration outcome (`T033`) uses user confirmation in v1; see Decision 8 and `contracts/client-mysql-integration.md`
- Client MySQL DDL/column map from TDM is required before marking T029/T032 done against a real staging DB
- Re-engagement cadence can be overridden via env vars for testing (see `quickstart.md`)
