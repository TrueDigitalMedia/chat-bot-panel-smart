# Data Model: PanelSmart Recruitment Bot

**Feature**: `001-panelsmart-recruitment-bot`
**Date**: 2026-07-07

---

## Entity: Lead

Primary record representing a potential panelist. Created on first Telegram contact.

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `id` | UUID | PK, auto-generated | Unique lead identifier (used as idempotency key for external API calls) |
| `telegram_chat_id` | BIGINT | UNIQUE, NOT NULL | Telegram chat ID — primary identifier for sending messages |
| `telegram_username` | VARCHAR(100) | NULLABLE | Telegram @username (display only; chat_id is authoritative) |
| `lead_status` | ENUM | NOT NULL | Current state in the state machine (see State Machine below) |
| `current_phase` | SMALLINT | NOT NULL, 1–4 | Active phase (1=Survey, 2=Onboarding, 3=Registration, 4=Confirmation) |
| `survey_question_index` | SMALLINT | NOT NULL, DEFAULT 0 | Current survey question (0=decision points, 1–16=survey questions) |
| `quota_segment` | VARCHAR(50) | NULLABLE | Socioeconomic segment assigned after scoring |
| `score` | SMALLINT | NULLABLE | Computed socioeconomic score (0–100, thresholds defined by Treinta) |
| `d1_accepted` | BOOLEAN | NOT NULL, DEFAULT false | Whether user accepted T&C (D1) |
| `d2_accepted` | BOOLEAN | NULLABLE | Whether user wants prizes (D2) |
| `d3_is_shopper` | BOOLEAN | NULLABLE | Whether user manages household purchases (D3) |
| `conversation_summary` | TEXT | NULLABLE | AI-generated summary of Phase 1 survey for PanelSmart platform submission |
| `re_engagement_count` | SMALLINT | NOT NULL, DEFAULT 0 | Total re-engagement notifications sent (max 3) |
| `last_activity_at` | TIMESTAMPTZ | NOT NULL | Timestamp of last inbound message from user |
| `created_at` | TIMESTAMPTZ | NOT NULL, DEFAULT now() | When lead was first created |
| `updated_at` | TIMESTAMPTZ | NOT NULL, DEFAULT now() | Last record update |

### State Machine: `lead_status` values

| Status | Description | Entry Condition | Exit Conditions |
|--------|-------------|-----------------|-----------------|
| `incomplete` | Survey started but not yet complete | D3 = "Sí"; survey question index 1–15 | All 16 survey fields collected → score + quota check |
| `not_qualified` | EXIT_A — declined T&C (D1) or prizes (D2) | D1 = "No" or D2 = "No" | Terminal — no exit |
| `quota_exhausted` | EXIT_B — D3 = "No" OR survey complete with no slot | D3 = "No" OR scoring finds no quota | Terminal (or re-enter queue — out of scope v1) |
| `link_sent` | Download links sent; awaiting app install | Qualification complete + quota available | 10min timeout → `waiting_for_code` |
| `waiting_for_code` | PATCH API sent; code delivery in progress | 10min elapsed without activation | Registration confirmed → `code_delivered_registered`; failure → `code_delivered_not_registered`; 20h silence → `code_delivered_no_response` |
| `code_delivered_registered` | User successfully registered in PanelSmart | Registration API confirms success | Phase 4 completion → `ficha_hogar_completada` |
| `code_delivered_not_registered` | Technical registration error | Registration API returns error | Human agent resolution (out of state machine) |
| `code_delivered_no_response` | 20h elapsed with no user reply after code delivery | 20h inactivity post code delivery | Terminal |
| `ficha_hogar_completada` | Household profile fully collected | All Phase 4 fields confirmed | Terminal — success |
| `abandono` | Re-engagement limit reached | 3 unanswered re-engagement notifications | Terminal |

---

## Entity: SurveyProfile

All 16 survey fields collected in Phase 1 (after D3 = "Sí"). One-to-one with Lead.
Fields are populated incrementally as the user answers each question; the row is created
when D3 is passed and updated after each answer.

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `id` | UUID | PK | Auto-generated |
| `lead_id` | UUID | FK → Lead, UNIQUE | One profile per lead |
| `full_name` | VARCHAR(200) | NULLABLE | Q1 — free text |
| `country` | VARCHAR(50) | NULLABLE | Q2 — one of 7 countries (button selection) |
| `state_province` | VARCHAR(100) | NULLABLE | Q3 — free text |
| `municipality` | VARCHAR(100) | NULLABLE | Q4 — free text (bot echoes back for confirmation) |
| `neighborhood` | VARCHAR(100) | NULLABLE | Q5 — free text |
| `email` | VARCHAR(200) | NULLABLE | Q6 — free text, validated as email format |
| `gender` | VARCHAR(20) | NULLABLE | Q7 — Hombre / Mujer (button) |
| `education_psh` | VARCHAR(50) | NULLABLE | Q8 — PSH education level (10-option button; scoring field) |
| `cars` | VARCHAR(10) | NULLABLE | Q9 — 0 / 1 / 2 o más (button; scoring field) |
| `domestic_help` | BOOLEAN | NULLABLE | Q10 — Sí / No (button; scoring field) |
| `household_size` | SMALLINT | NULLABLE, ≥ 1 | Q11 — number of residents (free text; scoring field) |
| `bedrooms` | SMALLINT | NULLABLE, ≥ 0 | Q12 — sleeping rooms (free text; scoring field) |
| `shopping_frequency` | VARCHAR(30) | NULLABLE | Q13 — frequency enum (button) |
| `shopping_categories` | SMALLINT[] | NULLABLE | Q14 — array of category numbers 1–8 (free text multi-select, LLM-parsed) |
| `contact_channel` | VARCHAR(20) | NULLABLE | Q15 — WhatsApp / Llamada telefónica (button) |
| `contact_schedule` | VARCHAR(30) | NULLABLE | Q16 — Mañana / Tarde / Noche (button) |
| `raw_free_text_json` | JSONB | NULLABLE | Raw LLM extraction outputs for free-text fields (audit/debug) |
| `extraction_model` | VARCHAR(100) | NULLABLE | Model used for free-text extractions |
| `completed_at` | TIMESTAMPTZ | NULLABLE | Non-null when all 16 fields are populated; triggers scoring |

**Validation rules**:
- `email` MUST match email format before being stored.
- `household_size` and `bedrooms` MUST be non-negative integers.
- `shopping_categories` values MUST be in range 1–8.
- All 5 scoring fields (`education_psh`, `cars`, `domestic_help`, `household_size`, `bedrooms`)
  MUST be non-null before `lead_status` can advance past `incomplete`.
- Partial updates are allowed — each question answer is written immediately after confirmed.

---

## Entity: FlowState

Tracks the lead's exact position in the conversation. Enables flow resumption after
FAQ digressions, re-engagement, or multi-turn correction loops.

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `id` | UUID | PK | Auto-generated |
| `lead_id` | UUID | FK → Lead, UNIQUE | One flow state per lead |
| `current_phase` | SMALLINT | NOT NULL | Mirrors Lead.current_phase for fast access |
| `decision_point` | VARCHAR(10) | NULLABLE | Current decision point if in D1/D2/D3 stage ('d1','d2','d3') |
| `survey_question_index` | SMALLINT | NOT NULL, DEFAULT 0 | Current survey question (0=not started, 1–16=question number) |
| `is_in_faq_digression` | BOOLEAN | NOT NULL, DEFAULT false | True while the bot is answering an off-topic message |
| `digression_resume_index` | SMALLINT | NULLABLE | Survey question index to return to after digression |
| `updated_at` | TIMESTAMPTZ | NOT NULL | Last update timestamp |

---

## Entity: ReEngagementSchedule

Tracks outbound re-engagement notification attempts per lead per phase.

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `id` | UUID | PK | Auto-generated |
| `lead_id` | UUID | FK → Lead | One schedule per lead per phase |
| `phase` | SMALLINT | NOT NULL | Phase during which inactivity occurred (1–4) |
| `attempt_number` | SMALLINT | NOT NULL, 1–3 | Which attempt this is |
| `scheduled_at` | TIMESTAMPTZ | NOT NULL | When QStash was instructed to deliver |
| `delivered_at` | TIMESTAMPTZ | NULLABLE | When QStash confirmed delivery |
| `outcome` | VARCHAR(20) | NULLABLE | `responded`, `no_response`, `cancelled` |
| `qstash_message_id` | VARCHAR(100) | NULLABLE | QStash message ID for deduplication/cancellation |

**Unique constraint**: (`lead_id`, `phase`, `attempt_number`) — prevents duplicate scheduling.

**Business rule**: When a lead responds, all pending QStash messages for that lead+phase
are cancelled (via QStash cancel API using `qstash_message_id`) and `outcome` is set to
`cancelled`.

---

## Entity: FAQEntry

Pre-approved support questions and answers used for semantic search. 75 entries total,
loaded at deploy time.

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `id` | UUID | PK | Auto-generated |
| `question` | TEXT | NOT NULL | The canonical FAQ question text |
| `answer` | TEXT | NOT NULL | The pre-approved answer text |
| `embedding` | vector(1536) | NOT NULL | Text embedding for pgvector similarity search |
| `category` | VARCHAR(50) | NULLABLE | Optional grouping (e.g., "app_install", "privacy", "compensation") |
| `created_at` | TIMESTAMPTZ | NOT NULL | When the entry was loaded |

**Index**: `USING hnsw (embedding vector_cosine_ops)` — enables sub-millisecond cosine
similarity search across all 75 entries.

---

## Entity: LLMCallLog

Observability record for every LLM API call made by the system (Principle II).

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `id` | UUID | PK | Auto-generated |
| `lead_id` | UUID | FK → Lead, NULLABLE | Associated lead (null for system-level calls) |
| `call_type` | VARCHAR(50) | NOT NULL | Purpose: `demographic_extraction`, `faq_search`, `conversation_summary`, `flow_response` |
| `model` | VARCHAR(100) | NOT NULL | LLM model ID used |
| `input_tokens` | INTEGER | NULLABLE | Prompt tokens consumed |
| `output_tokens` | INTEGER | NULLABLE | Completion tokens generated |
| `latency_ms` | INTEGER | NULLABLE | Wall-clock time for the call |
| `correlation_id` | UUID | NOT NULL | Ties together all calls for a single user turn |
| `called_at` | TIMESTAMPTZ | NOT NULL | When the call was made |
| `error` | TEXT | NULLABLE | Error message if the call failed |

---

## State Transition Diagram

```
[START / first message]
   │
   ▼
[D1: T&C] ──── "No, gracias" ──────────────────────────────────► not_qualified [EXIT_A, TERMINAL]
   │
   │ "Confirmo y acepto"
   ▼
[D2: Prizes] ── "No, gracias" ─────────────────────────────────► not_qualified [EXIT_A, TERMINAL]
   │
   │ "Sí quiero"
   ▼
[D3: Is Shopper] ── "No" ──────────────────────────────────────► quota_exhausted [EXIT_B, TERMINAL]
   │
   │ "Sí"
   ▼
[F1: 16-Question Survey Q1→Q16]
   ├── Mid-survey inactivity ─────────────────────────────────► incomplete (resume on return)
   ├── Survey complete, no quota ─────────────────────────────► quota_exhausted [EXIT_B + "🎉 ¡Gracias!", TERMINAL]
   └── Survey complete + quota available ─────────────────────────────────────────────────┐
                                                                                          ▼
[F2: Onboarding]                                                                     link_sent
   │ (10 min timeout)                                                                     │
   └── PATCH API sent ──────────────────────────────────────────────────────► waiting_for_code
                                                                                          │
[F3: Registration Monitor]                                                                │
   ├── Registration success ─────────────────────────────────► code_delivered_registered ─┐
   ├── Technical failure ─────────────────────────────► code_delivered_not_registered      │
   │                                                         (→ support redirect)          │
   └── 20h no response ────────────────────────────────► code_delivered_no_response [TERMINAL]
                                                                                          │
[F4: Profile Confirmation]                                              ◄─────────────────┘
   └── Summary sent + thank-you video ────────────────────────────► ficha_hogar_completada [TERMINAL]

[Re-engagement (any active phase)]
   └── 3 unanswered notifications ─────────────────────────────────────────► abandono [TERMINAL]

[Out-of-flow messages (any state)]
   ├── Active flow + FAQ match → deliver FAQ answer → resume pending question
   ├── Active flow + no FAQ match → re-send pending question (no state change)
   └── Terminal state / no flow → support redirect message
```
