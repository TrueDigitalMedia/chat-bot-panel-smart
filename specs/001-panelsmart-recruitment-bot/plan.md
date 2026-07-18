# Implementation Plan: PanelSmart Recruitment Bot

**Branch**: `001-panelsmart-recruitment-bot` | **Date**: 2026-07-07 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/001-panelsmart-recruitment-bot/spec.md`

## Summary

Automate the full panelist recruitment funnel for Treinta via Telegram (WhatsApp paused):
an 8-state lead machine guides users through hard-filter qualification, socioeconomic
scoring, PanelSmart app onboarding, and household profiling. AI extracts demographic data
from free-text, QStash handles per-user delayed re-engagement, pgvector powers FAQ semantic
search, and the Telegram Bot API manages all inbound/outbound messaging.

## Technical Context

**Language/Version**: TypeScript / Node.js 20 LTS — Next.js 15 (App Router), strict mode enabled.

**Primary Dependencies**:
- `ai` (Vercel AI SDK) — `generateObject` for structured demographic extraction; embeddings for FAQ
- `@ai-sdk/anthropic` — Claude Sonnet as the primary LLM
- `@upstash/qstash` — delayed re-engagement job scheduling (75min / 7h / 20h)
- `@vercel/postgres` — Neon Postgres client with pgvector for lead state + FAQ embeddings
- `chat-sdk.dev` — conversation state primitives and UI layer
- Telegram Bot API (direct HTTP) — inbound/outbound messaging (WhatsApp paused)
- `zod` — schema validation for LLM structured output and API contracts

**Storage**: Vercel Postgres (Neon) with `pgvector` extension.
- Tables: `leads`, `survey_profiles`, `flow_states`,
  `re_engagement_schedules`, `faq_entries`, `llm_call_logs`
- pgvector HNSW index on `faq_entries.embedding` for sub-millisecond similarity search

**Testing**: Vitest (unit — state machine transitions, scoring, extraction schemas);
Playwright (E2E — Telegram webhook simulation, full phase flows per quickstart.md scenarios).

**Target Platform**: Vercel serverless (Node.js runtime) + Vercel Postgres.
Telegram webhook handler runs as a serverless function with `after()` for deferred processing.

**Performance Goals**:
- Telegram webhook `200 OK` returned within 1 second.
- Demographic extraction (LLM call) completes within 4 seconds.
- FAQ semantic search completes within 100ms.
- State transition DB write completes within 200ms.

**Constraints**:
- WhatsApp integration is **paused** — no `WHATSAPP_*` credentials or Meta template approval
  required for this phase. Architecture is channel-agnostic to allow future re-enablement.
- QStash delivery cadence: 75 minutes → 7 hours → 20 hours; max 3 attempts per phase.
- Re-engagement messages are free-form text (no Telegram template approval required).
- Client MySQL sync and code lookup must complete within Vercel's serverless timeout budget.
- PII (demographic data) must not be logged in plaintext; log field names only, not values.
- Re-engagement timers must be cancellable when a user responds mid-cadence.

**Scale/Scope**: Initial target — hundreds of concurrent lead conversations; architecture
supports thousands with no structural changes (Vercel Postgres + QStash scale horizontally).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

### I. AI Safety & Guardrails ✅

- Demographic extraction uses `generateObject` + Zod schema — constrained output,
  no raw LLM text reaches the database or downstream scoring.
- Hard filters (T&C, household decision-maker) are pure boolean checks evaluated
  before any LLM call is made.
- FAQ answers are pulled from a pre-approved, Treinta-curated corpus — the LLM only
  selects from existing entries, never generates free-form answers.
- Anti-competition filter uses a fixed keyword list (no LLM judgment).
- PII fields (gender, education, etc.) are never echoed back in logs — only field names
  and schema compliance are logged.
- Rate limiting is applied at the Telegram webhook handler before any processing begins.
- Webhook secret token header validation runs before JSON parsing on every inbound request.

### II. Observability First ✅

- Every LLM API call is logged to `llm_call_logs` with: model version, latency_ms,
  token counts, correlation_id, lead_id, call_type.
- Every `lead_status` transition emits a structured log: lead_id, from_status, to_status,
  correlation_id, timestamp.
- Every QStash job delivery (scheduled, delivered, cancelled) is logged in
  `re_engagement_schedules` with outcome.
- Every client MySQL sync and code-lookup attempt logs: call_type, latency, lead_id, outcome.
- Health and readiness endpoints are included in the implementation scope.

### III. Simplicity / YAGNI — Justified Complexity ⚠️

The 4-phase state machine and 8 lead states are defined entirely by the Treinta business
requirement — not an engineering choice. See Complexity Tracking below for justifications.

All other architectural choices (pgvector over dedicated vector DB, fetch() over axios,
QStash over Inngest, enum transitions over XState) represent the simplest option
that meets the requirement.

## Project Structure

### Documentation (this feature)

```text
specs/001-panelsmart-recruitment-bot/
├── plan.md              # This file
├── research.md          # Phase 0 decisions
├── data-model.md        # Entity definitions and state diagram
├── quickstart.md        # Validation scenarios
├── contracts/
│   ├── telegram-webhook.md      # Inbound/outbound Telegram contracts (WhatsApp paused)
│   ├── lead-state-api.md        # Internal lead status API
│   └── client-mysql-integration.md # Client MySQL sync + registration code lookup
└── tasks.md             # Phase 2 output (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

```text
src/
├── app/
│   ├── api/
│   │   ├── webhooks/
│   │   │   ├── telegram/
│   │   │   │   └── route.ts         # Telegram Bot API inbound handler (POST only)
│   │   │   └── registration/
│   │   │       └── route.ts         # Optional/local registration outcome webhook
│   │   ├── leads/
│   │   │   └── [id]/
│   │   │       ├── route.ts         # GET lead state
│   │   │       └── status/
│   │   │           └── route.ts     # PATCH lead status transition
│   │   └── jobs/
│   │       └── re-engage/
│   │           └── route.ts         # QStash re-engagement job handler
│   └── (admin)/                     # Optional debug/monitoring UI (out of scope v1)
├── lib/
│   ├── state-machine/
│   │   ├── transitions.ts           # Allowed-transitions map + transition validator
│   │   └── index.ts
│   ├── conversation/
│   │   ├── phases/
│   │   │   ├── phase-1.ts           # Questionnaire + hard filters
│   │   │   ├── phase-2.ts           # Onboarding + link delivery
│   │   │   ├── phase-3.ts           # Registration monitoring
│   │   │   └── phase-4.ts           # Household profiling
│   │   ├── flow-router.ts           # Routes inbound messages to correct phase handler
│   │   └── faq-handler.ts           # FAQ digression + flow resumption
│   ├── scoring/
│   │   └── socioeconomic.ts         # Score calculation (algorithm provided by Treinta)
│   ├── rag/
│   │   ├── embed.ts                 # Embedding generation via Vercel AI SDK
│   │   └── search.ts                # pgvector cosine similarity search
│   ├── scheduler/
│   │   ├── re-engagement.ts         # QStash schedule / cancel helpers
│   │   └── constants.ts             # Cadence config (75min, 7h, 20h)
│   ├── ai/
│   │   ├── extract-survey-fields.ts # generateObject + SurveyProfile field extraction
│   │   └── summarize-phase1.ts      # Conversation summary for Phase 4 context
│   ├── client-mysql/
│   │   ├── pool.ts                  # mysql2 pool (CLIENT_MYSQL_*)
│   │   ├── sync-lead.ts             # Upsert qualified lead into client MySQL
│   │   ├── fetch-panelist-code.ts   # SELECT registration code / panelist ID
│   │   └── map-lead-row.ts          # Lead/survey → MySQL column map
│   ├── telegram/
│   │   ├── send.ts                  # Outbound message / inline keyboard sender
│   │   └── verify.ts                # Webhook secret token header validation
│   └── db/
│       ├── schema.ts                # Drizzle ORM schema definitions
│       ├── migrations/              # SQL migration files
│       └── seed/
│           └── faqs.ts              # FAQ embedding seed script
└── types/
    ├── lead.ts                      # Lead, LeadStatus enum, SurveyProfile types
    ├── flow.ts                      # FlowState, phase types
    └── telegram.ts                  # Telegram Update / Message payload types

tests/
├── e2e/
│   ├── phase-1-qualification.spec.ts
│   ├── phase-2-onboarding.spec.ts
│   ├── phase-3-registration.spec.ts
│   ├── phase-4-household.spec.ts
│   ├── re-engagement.spec.ts
│   └── faq-digression.spec.ts
└── unit/
    ├── state-machine.test.ts
    ├── extract-demographics.test.ts
    ├── scoring.test.ts
    └── faq-search.test.ts
```

**Structure Decision**: Next.js App Router web service. All bot logic lives in `src/lib/`
as pure TypeScript modules. API routes in `src/app/api/` are thin handlers that delegate
to lib functions. This keeps business logic independently testable with Vitest without
mounting the HTTP layer.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|--------------------------------------|
| 8-state lead machine | Business requirement from Treinta defines 8 distinct states with different bot behaviors | Collapsing states loses the ability to resume correctly after async gaps (hours/days between turns) |
| 4-phase sequential flow | Treinta's funnel design requires qualification before onboarding, registration before confirmation | Merging phases would break the quota-check gate and the registration-confirmation handshake |
| Client MySQL (2nd DB) | Client owns panelist creation; bot only writes leads and reads codes | Calling CreatePanelist/GPM or inventing codes would diverge from the client registry |
| QStash dependency | Per-user delays (75min/7h/20h from last activity) cannot be expressed as cron expressions | Vercel Cron requires polling with 60s resolution jitter and continuous DB load; not acceptable for re-engagement quality |
| pgvector + embeddings | Telegram FAQ queries are paraphrased colloquially — lexical string matching misses them | TF-IDF / fuzzy match produces unacceptable miss rates for natural-language questions |
