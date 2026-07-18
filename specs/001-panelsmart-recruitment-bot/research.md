# Research: PanelSmart Recruitment Bot

**Feature**: `001-panelsmart-recruitment-bot`
**Date**: 2026-07-07
**Status**: Complete — Decision 6 updated 2026-07-17 (client MySQL; DDL map still pending from TDM)

---

## Decision 1: Persistent Async Lead State Machine

**Decision**: Vercel Postgres (Neon) with simple enum-based state transitions.

**Rationale**: Vercel's serverless functions are stateless and ephemeral; conversation state
must live in durable storage across WhatsApp turns that can be days apart. Vercel Postgres is
already the primary data store, so adding a `lead_status` enum column requires zero additional
infrastructure. The state machine is a pure validation function: read current status, validate
the proposed transition against an allowed-transitions map, write the new status in the same
transaction. This is sufficient for 8 linear states with deterministic business rules.

**Alternatives considered**:
- **Vercel KV**: Deprecated (Dec 2024, migrated to direct Upstash Redis); no relational
  guarantees, TTL-based data loss risk for long-lived leads. Rejected.
- **XState**: Designed for hierarchical/parallel state machines. Requires serializing machine
  snapshots to DB on every turn (via `actor.getPersistedSnapshot()`). Operational overhead of
  Restate or Durable Objects for serverless orchestration is unjustified for 8 linear states.
  Rejected per Principle III (Simplicity/YAGNI).
- **In-memory state**: Not viable on serverless — each invocation is a fresh process. Rejected.

---

## Decision 2: Delayed Re-engagement Notification Scheduling (75min / 7h / 20h)

**Decision**: QStash (Upstash) for delay-based job delivery.

**Rationale**: QStash is purpose-built for this pattern: publish a message now with an arbitrary
delay (`Upstash-Delay: 75m` header) and it delivers an HTTP POST to the target Vercel route at
the correct time with automatic retries. Supports delays up to 90 days. Deduplication via
`Upstash-Message-Id` prevents double-sending if the user triggers re-engagement reset. Free tier
covers 500 messages/day; scales at $1/100K messages.

**Alternatives considered**:
- **Vercel Cron Jobs**: Uses fixed cron expressions, not per-user delays. Would require
  DB polling every minute for inactivity thresholds — adds continuous query load, 60-second
  delivery jitter, and idempotency complexity. Rejected.
- **Inngest**: Better fit for multi-step workflows with `step.sleep()`. For three independent
  fire-and-forget HTTP calls at fixed delays, QStash is simpler and cheaper. Inngest reserved
  for more complex orchestration needs if they arise.
- **DB polling cron**: Brittle, adds DB load, minimum 1-minute resolution error. Rejected.

---

## Decision 3: FAQ Semantic Search (75 entries)

**Decision**: pgvector extension on Vercel Postgres with embedding-based similarity search.

**Rationale**: pgvector with HNSW indexing handles millions of vectors at sub-20ms; 75 entries
is trivially small. Since Vercel Postgres is already in the stack, enabling pgvector is a single
SQL command — no new vendor, billing account, or connection to manage. The Vercel AI SDK's
official RAG starter template uses this exact combination. Semantic embeddings are strongly
preferred over string similarity because users ask FAQ questions in colloquial WhatsApp language
that rarely matches FAQ entry text lexically.

**Alternatives considered**:
- **Upstash Vector**: Managed vector DB with Vercel AI SDK integration. Technically viable but
  introduces a second vendor alongside Postgres with no performance advantage at 75 entries.
  Revisit if FAQ corpus exceeds 10K entries.
- **Pinecone**: Enterprise-grade, designed for billions of vectors. Disproportionate for 75
  entries; paid subscription, third-party dependency, extra latency hop. Rejected.
- **TF-IDF / fuzzy string match**: Fails on paraphrased queries — the dominant pattern in
  conversational WhatsApp usage. Insufficient semantic retrieval quality. Rejected.

---

## Decision 4: Structured Demographic Data Extraction from Free-Text

**Decision**: Vercel AI SDK `generateObject` with Zod schema (structured output mode).

**Rationale**: `generateObject` uses constrained decoding (finite state machine token masking
at generation time) where supported, guaranteeing 100% schema-valid output. Adding `.describe()`
to each Zod field gives the model semantic guidance. This eliminates silent failures (wrong
types, missing fields) that corrupt downstream socioeconomic scoring. The SDK handles
provider-specific mode selection automatically, keeping code portable across Claude models.

**Alternatives considered**:
- **Prompt + regex**: Fails silently on free-text edge cases; no type guarantees; brittle
  maintenance per field type. Reliability ceiling ~95% — too low for data that drives scoring.
  Rejected.
- **Manual function calling + JSON parsing**: Equivalent to what `generateObject` does
  internally, but requires hand-rolling schema→function-definition translation, validation,
  and error handling. Zero benefit over the SDK's built-in approach. Rejected.

---

## Decision 5: Messaging Channel — Telegram (WhatsApp paused)

**Decision**: Telegram Bot API with webhook delivery to a Next.js API route.

**Context**: WhatsApp integration is paused. Telegram is used for this phase of development.
The architecture is designed so switching back to WhatsApp (or adding it in parallel) is
a matter of adding a new webhook handler and a new outbound sender — all business logic
in `lib/conversation/` and `lib/state-machine/` remains channel-agnostic.

**Rationale**: Telegram Bot API is significantly simpler to integrate than Meta Cloud API:
no business account approval, no per-message template registration, no 24-hour session window,
and no HMAC signature computation (a secret token header check is sufficient). This reduces
time-to-first-working-bot considerably. Critically, Telegram imposes no restrictions on
outbound messages to users who have previously started a conversation — re-engagement
notifications require no pre-approved templates and no platform review, eliminating the
key operational bottleneck of the WhatsApp path.

**Key Telegram simplifications vs. WhatsApp**:
- Re-engagement messages: free-form text, no Meta template approval needed.
- No 24-hour conversation window — bot can message users anytime post-first-contact.
- Webhook verification: header token check (no HMAC over raw body bytes).
- Hub verification handshake: not required — Telegram webhook registration is a one-time API call.
- Inline keyboards available natively for yes/no prompts (T&C, hard filters).

**What changes when WhatsApp is re-enabled**:
- Add `src/lib/whatsapp/` sender + `src/app/api/webhooks/whatsapp/route.ts`
- Re-engagement jobs switch from free-form to template payloads
- `Lead.telegram_chat_id` and `Lead.phone_number` can coexist (multi-channel)

**Alternatives considered**:
- **Keeping WhatsApp now**: Business account approval + Meta template review adds 1–2 weeks
  before first working demo. Deferred to production phase.
- **SMS**: No conversational UI, no inline keyboards, carrier costs. Rejected.
- **Email**: Wrong channel for real-time recruitment funnel engagement. Rejected.

---

## Decision 6: Client MySQL Lead Sync + Registration Code Lookup (supersedes PATCH/GPM)

**Decision (2026-07-17)**: On qualification with quota, the bot **upserts lead data into the
client MySQL database**. A **client-owned internal process** creates the panelist and writes
the registration code (panelist ID) into MySQL. After the user **confirms app download**, the
bot **SELECTs** that code and sends it on Telegram. Feature-flagged via
`CLIENT_MYSQL_SYNC_ENABLED`. Driver: `mysql2` pool.

**Rationale**: TDM/client confirmed they will not expose CreatePanelist (GPM/AES) or a
PanelSmart PATCH for code delivery to this bot. The operational flow is: bot writes lead →
internal process registers → bot reads code after download confirmation. Keeping the bot as
a MySQL reader/writer avoids owning CRM crypto/APIs and matches the client's existing
pipeline.

**Alternatives considered**:
- **CreatePanelist AES/GPM HTTP API**: Documented in a vendor PDF but explicitly dropped for
  this project in favor of MySQL sync. Rejected.
- **PanelSmart PATCH `/panelists/{id}/registration-code`**: Original spec Decision 6; no longer
  the integration path. Rejected for production; local `MOCK-…` codes remain only when the
  MySQL flag is off.
- **Bot generates codes itself**: Would diverge from the client's panelist registry. Rejected.

**Open dependency**: Official MySQL DDL / column map from TDM/client (table name, lead key,
code column). Until delivered, mapper uses documented placeholders.

---

## Decision 8: Registration Outcome Signal

**Decision**: v1 uses **user confirmation buttons** after code delivery
(“Ya me registré” / “No pude registrarme”) to transition to
`code_delivered_registered` / `code_delivered_not_registered`. Optional later: client webhook
or MySQL status-column polling (see `contracts/client-mysql-integration.md`).

**Rationale**: No PanelSmart registration webhook is required for the MySQL path; user
confirm keeps Phase 3 testable without an external push.
