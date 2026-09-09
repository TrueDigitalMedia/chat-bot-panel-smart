# Phase 1 Data Model: Web Chat Country Rooms

## 1. Database changes

### 1.1 `leads` — new column (migration `0017_web_chat_rooms.sql`)

> Numbered `0017` (not `0016`): feature 015's household-roster spike may claim `0016`
> (`0016_mexico_household_members.sql`) and 016 depends on 014 + 015, so 015's migrations land first.
> If 015 ends up not needing `0016`, this may be renumbered down at implementation time.

| Column | Type | Null | Notes |
|--------|------|------|-------|
| `acquisition_source` | `varchar(40)` | yes | `'web:room:Ecuador'` \| `'web:room:México'` \| `null`. `null` = generic `/chat`, Telegram, or WhatsApp (the implicit default). Set once, at lead creation via a room. |

```sql
ALTER TABLE leads ADD COLUMN acquisition_source varchar(40);
```

Per memory `feedback_migrations_must_be_applied`: apply to the live Neon branch in the same change as
the `schema.ts` edit. No backfill (existing rows stay `null`).

Nothing else changes. `survey_profiles.country` (existing, `varchar(50)`, nullable) is the field a
room pre-populates.

## 2. Chat-room registry (`src/lib/web/chat-rooms.ts`)

```ts
/** The fixed room set. Slugs: lowercase ASCII, accent-free. Values: canonical CountryConfig names. */
export const CHAT_ROOMS = {
  ecuador: 'Ecuador',
  mexico: 'México',
} as const

export type ChatRoomSlug = keyof typeof CHAT_ROOMS

/** slug → canonical country name, or null for an unknown slug. */
export function resolveRoom(slug: string): string | null

/** country name → absolute room URL (`${APP_BASE_URL}/chat/<slug>`; relative if APP_BASE_URL unset). */
export function roomUrl(country: string): string

/** For the admin page: every room as { country, slug, url }. */
export function listRooms(): { country: string; slug: ChatRoomSlug; url: string }[]
```

Rules:
- `resolveRoom` is case-insensitive on the slug, returns `null` (never throws) for anything not in
  `CHAT_ROOMS`.
- A resolved country is only *usable* if `getCountryConfig(country)` has a real config; the bootstrap
  handler checks this and degrades otherwise (research R7).
- This registry is the single source of truth for the room set (FR-008) — the route segment and the
  admin page both import it.

## 3. Bootstrap handler behavior (`GET /api/chat/web?room=<slug>`)

State machine for the `room` param (full contract in `contracts/web-bootstrap-room-param.md`):

| Condition | Action |
|-----------|--------|
| no `?room=` | unchanged behavior |
| `?room=` + lead has messages OR `survey_profiles.country` already set | ignore `room`; log `web_room_entry { outcome: 'existing_lead_ignored' }` |
| `?room=` + brand-new lead (0 messages, country null) + `resolveRoom` hit + config exists | `UPDATE survey_profiles SET country = <name> WHERE lead_id = …`; `UPDATE leads SET acquisition_source = 'web:room:<name>'`; log `web_room_entry { outcome: 'applied' }`; then the normal "send opening message" path runs |
| `?room=` + `resolveRoom` miss, or config missing | do not set country; log `web_room_entry { outcome: 'degraded', slug }`; normal flow (country question will be asked) |

Response shape is **unchanged** (`{ leadId, leadStatus, messages }`).

## 4. `nextQuestionToSend` helper in `src/lib/conversation/survey-plan.ts`

`survey-plan.ts` is created by feature 014; **016 adds** this helper (full contract in
`contracts/survey-preanswered-skip.md`). `resolveSurveyQuestions` and the question list are
**unchanged** — the helper only decides which positions are *sent*.

`nextQuestionToSend(questions, fromIndex, answered, geoLabels)` skips a position when **either**:

1. **Already answered** — `answered[fieldName] != null`. Today only `country`, set by a room. If a
   room lead later *corrects* their country it stays non-null, so it stays skipped and the corrected
   value is used.
2. **Geo question this country does not ask** — `fieldName ∈ {stateProvince, municipality,
   neighborhood}` and the matching `geoLabels.*Label` is `null`. CAM: only `neighborhood` → skipped,
   identical to today's Q5-hidden behavior. Ecuador/México: all three labels set → nothing skipped.

Transitive; `survey_question_index` advances past a skipped position (and the geo field is written
`null` for a rule-2 skip) exactly as the current code does. Replaces the four copy-pasted
`neighborhood` skips in `send-survey-question.ts`, `geo/handle-confirm.ts`, `phases/phase-1.ts`,
`gps-capture.ts`.

**No-op guarantee**: for every existing CAM / Telegram / WhatsApp conversation the helper produces
the same sent-question sequence and the same `survey_question_index` progression as today (rule 2
reproduces Q5-hidden; rule 1 never fires — `country` is answered at Q2). No `survey_question_index`
data migration. Regression: CAM golden-master (Telegram) zero snapshot diff; bare-`/chat` "still asks
country" via the Playwright E2E.

## 5. Room-lead conversation state

- Created via `upsertLead('web', sessionId)` exactly as today (lead + empty `survey_profiles` +
  `flow_states`). The room handler then patches `survey_profiles.country` + `leads.acquisition_source`
  **before** `handlePhase1` sends the opening message.
- Gates unchanged: opt-in → D1 → D3 → phone gate.
- `needsGpsCapture(lead)` returns `false` when `survey_profiles.country` is set → room leads go
  straight to manual geo (Q3). (research R4)
- Survey starts at Q1 (`fullName`); Q2 (`country`) self-skips via §4; Q3 onward is
  `resolveSurveyQuestions('Ecuador' | 'México')` from 014/015.

## 6. Observability

| Event | Fields |
|-------|--------|
| `web_room_entry` | `session_id_hash`, `slug`, `resolved_country` \| `null`, `outcome` (`applied` \| `existing_lead_ignored` \| `degraded`) |

`leads.acquisition_source` feeds funnel/attribution queries (dashboard, sync snapshot).

## 7. UI

- `src/app/chat/[room]/page.tsx` — server component: `resolveRoom(params.room)`; hit → render the same
  layout as `page.tsx` with `<ChatWindow roomSlug={params.room} />` (optionally a one-line
  market intro from a small copy map); miss → render the generic layout (no slug). Never 404s.
- `src/app/chat/chat-window.tsx` — new optional `roomSlug?: string` prop; when set, the bootstrap
  `GET` URL becomes `/api/chat/web?room=${roomSlug}`. No other change.
- `src/app/admin/rooms/page.tsx` — server component: `listRooms()` → table of country / URL /
  `<CopyLink url={…} />`. Note shown if `APP_BASE_URL` is unset (URLs are relative).
- `src/app/admin/admin-sidebar.tsx` — add a "Salas" nav item.
