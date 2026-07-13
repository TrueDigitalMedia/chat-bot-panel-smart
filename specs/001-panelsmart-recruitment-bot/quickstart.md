# Quickstart Validation Guide: PanelSmart Recruitment Bot

**Feature**: `001-panelsmart-recruitment-bot`
**Date**: 2026-07-07

This guide documents how to validate that each phase of the recruitment flow works
end-to-end. Run these scenarios in order after initial setup.

---

## Prerequisites

- Vercel project created and linked (`vercel link`)
- Vercel Postgres database provisioned and `pgvector` extension enabled
- Environment variables set (see below)
- Telegram bot created via @BotFather and bot token obtained
- Telegram webhook registered (`setWebhook` called with your Vercel URL)
- QStash account created and `QSTASH_TOKEN` set
- PanelSmart API credentials provided by Treinta
- *(Telegram integration paused — no Meta credentials needed for this phase)*

**Required environment variables**:
```
TELEGRAM_BOT_TOKEN=<token_from_botfather>
TELEGRAM_WEBHOOK_SECRET=<random_secret_for_header_validation>
POSTGRES_URL=<vercel_postgres_connection_string>
QSTASH_TOKEN=<upstash_qstash_token>
QSTASH_CURRENT_SIGNING_KEY=<upstash_signing_key>
QSTASH_NEXT_SIGNING_KEY=<upstash_next_signing_key>
PANELSMART_API_URL=<panelsmart_base_url>
PANELSMART_API_KEY=<panelsmart_bearer_token>
ANTHROPIC_API_KEY=<anthropic_api_key>
```

**Register Telegram webhook** (run once after deploy):
```bash
curl -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://<your-vercel-domain>/api/webhooks/telegram",
    "secret_token": "<TELEGRAM_WEBHOOK_SECRET>",
    "allowed_updates": ["message", "callback_query"]
  }'
```

**Database setup**:
```bash
# Run migrations to create all tables and enable pgvector
npm run db:migrate

# Seed FAQ embeddings (requires AI API key)
npm run db:seed:faqs
```

---

## Scenario 1a: D1 Rejection — T&C Decline (FR-001, FR-002)

**Goal**: Verify a user who declines T&C receives EXIT_A and is disqualified.

**Steps**:
1. Start a Telegram conversation with the bot.
2. Bot sends T&C message with link and inline keyboard ("Confirmo y acepto" / "No, gracias").
3. Tap "No, gracias".

**Expected outcome**:
- Bot sends EXIT_A message verbatim (starts with "Lo sentimos 💙", includes Facebook/Instagram links).
- `Lead.lead_status` = `not_qualified`.
- No further messages sent.

**Verify**:
```sql
SELECT lead_status, d1_accepted FROM leads WHERE telegram_chat_id = <your_chat_id>;
-- Expected: not_qualified, false
```

---

## Scenario 1b: D2 Rejection — Prizes Decline (FR-001, FR-002)

**Goal**: Verify a user who accepts T&C but declines prizes receives EXIT_A.

**Steps**:
1. Start conversation → tap "Confirmo y acepto" at D1.
2. Bot sends prizes question ("¿Quieres ganar premios por decirnos qué compras?").
3. Tap "No, gracias".

**Expected outcome**:
- Bot sends EXIT_A message verbatim.
- `Lead.lead_status` = `not_qualified`.

**Verify**:
```sql
SELECT lead_status, d1_accepted, d2_accepted FROM leads WHERE telegram_chat_id = <your_chat_id>;
-- Expected: not_qualified, true, false
```

---

## Scenario 1c: D3 Rejection — Not the Household Shopper (FR-001, FR-002)

**Goal**: Verify a user who passes D1/D2 but says "No" at D3 receives EXIT_B.

**Steps**:
1. Accept T&C (D1) → accept prizes (D2).
2. Bot asks "¿Eres quién administra y organiza las compras del hogar?".
3. Tap "No".

**Expected outcome**:
- Bot sends EXIT_B message verbatim (starts with "😔 Lo sentimos, por ahora el cupo...").
- `Lead.lead_status` = `quota_exhausted`.
- No survey questions asked.

**Verify**:
```sql
SELECT lead_status, d3_is_shopper, survey_question_index FROM leads WHERE telegram_chat_id = <your_chat_id>;
-- Expected: quota_exhausted, false, 0
```

---

## Scenario 2: Full Survey — Qualification with Quota (FR-003–FR-006)

**Goal**: Verify all 16 survey questions are asked in order, data is stored, and the lead advances to Phase 2 when quota is available.

**Steps**:
1. Accept T&C (D1) → accept prizes (D2) → confirm as household shopper (D3).
2. Answer all 16 questions using these sample inputs:
   - Q1 full_name: type `"María García"`
   - Q2 country: tap `"Guatemala"`
   - Q3 state_province: type `"Guatemala"`
   - Q4 municipality: type `"Mixco"` (bot echoes "He entendido que tu municipio es Mixco.")
   - Q5 neighborhood: type `"Colonia El Naranjo"`
   - Q6 email: type `"maria@example.com"`
   - Q7 gender: tap `"Mujer"`
   - Q8 education_psh: tap `"Universidad Completa"`
   - Q9 cars: tap `"1"`
   - Q10 domestic_help: tap `"No"`
   - Q11 household_size: type `"4"`
   - Q12 bedrooms: type `"2"`
   - Q13 shopping_frequency: tap `"Semanal"`
   - Q14 shopping_categories: type `"1,2,5,6"`
   - Q15 contact_channel: tap `"WhatsApp"`
   - Q16 contact_schedule: tap `"Mañana (9-12hs)"`
3. Ensure quota slots are available for the test segment.

**Expected outcome**:
- `survey_profiles` record fully populated (all 16 fields non-null).
- `Lead.score` set to a computed value.
- `Lead.lead_status` = `link_sent`.
- Bot sends PanelSmart iOS/Android download links.

**Verify**:
```sql
SELECT lead_status, score, survey_question_index FROM leads WHERE telegram_chat_id = <your_chat_id>;
-- Expected: link_sent, <score_value>, 16

SELECT full_name, country, email, education_psh, cars, domestic_help, household_size, bedrooms,
       shopping_categories, contact_channel, contact_schedule, completed_at
FROM survey_profiles WHERE lead_id = '<lead_id>';
-- All fields non-null; completed_at non-null
```

---

## Scenario 3: LLM Extraction Error — Retry on Next Message (FR-003, FR-005)

**Goal**: Verify that when free-text extraction fails (e.g., LLM timeout), the bot gracefully retries on the next user message without advancing the question index.

**Steps**:
1. Complete D1→D2→D3.
2. At Q11 (household_size), mock a LLM extraction failure (set env var `FORCE_EXTRACTION_ERROR=household_size`).
3. Type any answer for Q11 (e.g., `"somos cuatro"`).

**Expected outcome**:
- Bot replies: "Tuve un problema, ¿puedes repetirlo?"
- `FlowState.survey_question_index` remains at 11 (unchanged).
- On next message with the same text, extraction succeeds (disable the mock).

**Verify**:
```sql
SELECT survey_question_index FROM flow_states WHERE lead_id = '<lead_id>';
-- Expected: 11 (unchanged after error)
```

---

## Scenario 4: Quota Exhausted After Full Survey (FR-004)

**Goal**: Verify the EXIT_B + thank-you message when survey is completed but no quota slot is available.

**Steps**:
1. Set quota to 0 for all segments (or the test segment) in the quota data source.
2. Complete all 16 survey questions.

**Expected outcome**:
- `Lead.lead_status` = `quota_exhausted`.
- Bot sends EXIT_B message verbatim followed immediately by "🎉 ¡Gracias por tus respuestas!".
- No download links sent.

**Verify**:
```sql
SELECT lead_status FROM leads WHERE telegram_chat_id = <your_chat_id>;
-- Expected: quota_exhausted
SELECT completed_at FROM survey_profiles WHERE lead_id = '<lead_id>';
-- Expected: non-null (survey completed before quota check)
```

---

## Scenario 5: 10-Minute Timeout and PATCH Call (FR-007, FR-008)

**Goal**: Verify the registration code delivery trigger after timeout.

> **Note**: For testing, override the 10-minute window to 10 seconds via an env var
> `RE_ENGAGEMENT_TIMEOUT_OVERRIDE_SECONDS=10`.

**Steps**:
1. Complete Phase 1 (qualified lead).
2. Receive download links.
3. Do not respond for the configured timeout duration.

**Expected outcome**:
- `Lead.lead_status` = `waiting_for_code`.
- PanelSmart PATCH API call is logged in `system_call_logs` with `call_type = panelsmart_patch`.
- Bot sends onboarding video message.

**Verify**:
```sql
SELECT outcome FROM re_engagement_schedules
WHERE lead_id = '<lead_id>' ORDER BY attempt_number;
-- First entry should show the scheduled job
```

---

## Scenario 6: Out-of-Flow Message Handling (FR-016, FR-017, FR-018)

**Goal**: Verify the three out-of-flow behaviors: FAQ answer + resume, direct resume, and terminal redirect.

### 6a — FAQ match during active survey
**Steps**:
1. Get a lead to Q8 (education_psh question, `survey_question_index = 8`).
2. Send: `"¿Cuánto me pagan por participar?"`

**Expected outcome**:
- Bot delivers FAQ answer relevant to compensation.
- Bot sends transition message ("Continuemos donde lo dejamos 👉").
- Bot re-sends Q8 question with its original inline keyboard buttons.
- `FlowState.survey_question_index` unchanged (still 8).

**Verify**:
```sql
SELECT survey_question_index, is_in_faq_digression
FROM flow_states WHERE lead_id = '<lead_id>';
-- survey_question_index = 8; is_in_faq_digression = false
```

### 6b — No FAQ match during active survey
**Steps**:
1. Same setup as 6a (lead at Q8).
2. Send: `"¿Qué productos venden?"` (no FAQ match expected).

**Expected outcome**:
- Bot re-sends Q8 question directly (no FAQ answer, no "Te invito a escribir").
- No change to `survey_question_index`.

### 6c — Message in terminal state
**Steps**:
1. Get a lead with `lead_status = not_qualified`.
2. Send any message.

**Expected outcome**:
- Bot sends support redirect: "Te invito a escribir a nuestro canal de atención en el {SUPPORT_CONTACT} para resolver tus dudas. Estoy aquí para ayudarte con tu inscripción cuando quieras."
- No state change.

---

## Scenario 7: Re-engagement Cadence (FR-014, FR-015)

**Goal**: Verify three re-engagement notifications fire and `abandono` is set after no response.

> **Note**: Use `RE_ENGAGEMENT_CADENCE_OVERRIDE_SECONDS=30,60,90` for testing.

**Steps**:
1. Get a lead to any active phase.
2. Go silent (do not reply).
3. Wait for all three re-engagement notifications.

**Expected outcome**:
- Three outbound Telegram template messages are sent at the configured intervals.
- After the third unanswered notification, `Lead.lead_status` = `abandono`.
- No further messages are sent.

**Verify**:
```sql
SELECT attempt_number, outcome FROM re_engagement_schedules
WHERE lead_id = '<lead_id>' ORDER BY attempt_number;
-- 3 rows; last outcome = 'no_response' triggering abandono
SELECT lead_status FROM leads WHERE lead_id = '<lead_id>';
-- Expected: abandono
```

---

## Scenario 8: Full Happy Path — Phase 1 → 4

**Goal**: Verify the complete funnel end-to-end.

**Steps**:
1. Complete Phase 1 (qualified + quota available).
2. Simulate PanelSmart registration success (fire webhook or mock API).
3. Proceed through Phase 4 household questions.
4. Confirm thank-you video is sent.

**Expected outcome**:
- `Lead.lead_status` progresses: `link_sent` → `waiting_for_code` →
  `code_delivered_registered` → `ficha_hogar_completada`.
- `survey_profiles.completed_at` is non-null (set in Phase 1).
- Bot sends thank-you video message.

---

## Observability Checks (Constitution Principle II — REQUIRED)

Run these queries after any scenario to verify observability is working. All three
query groups must return data after a full Phase 1 → Phase 2 run.

### Query 1: AI & API Call Audit

```sql
-- Every LLM and external API call must be logged in system_call_logs
SELECT call_type, model, input_tokens, output_tokens, latency_ms, correlation_id, error
FROM system_call_logs
WHERE lead_id = '<lead_id>'
ORDER BY called_at;

-- Expected call_types after a full qualification: demographic_extraction, panelsmart_patch
-- Expected call_types after FAQ interaction: faq_search
-- Expected call_types after Phase 4: conversation_summary
-- All rows must have non-null latency_ms and correlation_id
-- Any row with non-null error requires investigation before production deploy
```

### Query 2: Lead Funnel by Status

```sql
-- Verify lead distribution across the funnel
SELECT lead_status, COUNT(*) as count
FROM leads
GROUP BY lead_status
ORDER BY count DESC;

-- Use to detect: funnel drop-off, unexpected abandono spikes,
-- leads stuck in incomplete (may indicate LLM extraction issues)
```

### Query 3: Re-engagement Outcome Rate

```sql
-- Verify re-engagement effectiveness
SELECT
  attempt_number,
  COUNT(*) as total,
  SUM(CASE WHEN outcome = 'responded' THEN 1 ELSE 0 END) as responded,
  SUM(CASE WHEN outcome = 'no_response' THEN 1 ELSE 0 END) as no_response,
  SUM(CASE WHEN outcome = 'cancelled' THEN 1 ELSE 0 END) as cancelled
FROM re_engagement_schedules
GROUP BY attempt_number
ORDER BY attempt_number;

-- SC-003 target: re-engagement should recover >= 20% of inactive leads
-- (responded / (responded + no_response) across all attempts >= 0.20)
```

### Query 4: State Transition Trace (per lead)

```sql
-- Reconstruct full state machine path for a specific lead
-- (requires structured log output captured to a log table or log aggregator)
-- If using application-level logging, filter by lead_id:
SELECT lead_id, from_status, to_status, phase, correlation_id, timestamp
FROM state_transition_log  -- application log table if implemented
WHERE lead_id = '<lead_id>'
ORDER BY timestamp;

-- All 5 fields must be present: lead_id, from_status, to_status, correlation_id, timestamp
```

### Query 5: Input Rejection Monitor

```sql
-- Verify input sanitization is firing (should be rare in legitimate use)
SELECT COUNT(*) as rejections, DATE_TRUNC('hour', called_at) as hour
FROM system_call_logs
WHERE call_type = 'input_rejected'
GROUP BY hour
ORDER BY hour DESC;

-- Spike in rejections may indicate prompt injection attempts
```
