# Contract: `GET /api/chat/web?room=<slug>`

**Handler**: `src/app/api/chat/web/route.ts` `GET` · extends spec 012's bootstrap contract.

## Request

`GET /api/chat/web` — unchanged.
`GET /api/chat/web?room=<slug>` — `slug` is an optional room identifier (`ecuador` | `mexico`).
The visitor's `web_session_id` cookie is resolved / created as today.

The `POST` turn endpoint does **not** accept `room` and is unchanged.

## Response

Unchanged: `200 { leadId: string, leadStatus: string, messages: OutboundMessageDTO[] }`
(or `429 { error: 'rate_limited' }`).

## Behavior — the `room` param

Let `lead = upsertLead('web', sessionId)` and `existing = fetchAllMessages(lead.id)`.

1. **No `room` param** → existing behavior verbatim (send opening message iff `existing.length === 0`).

2. **`room` present, but this is NOT a brand-new conversation** — i.e. `existing.length > 0` OR
   `survey_profiles.country` is already non-null:
   - Ignore `room`. Do not write anything.
   - `console.info('[web] web_room_entry', { outcome: 'existing_lead_ignored', slug, … })`
   - Continue existing behavior (resume transcript; no opening message).
   - This is FR-005 / FR-006 — reopening a room URL, or opening a different room, or the bare `/chat`,
     never re-scopes an in-progress lead.

3. **`room` present, brand-new conversation** (`existing.length === 0` AND `survey_profiles.country`
   is null):
   - `country = resolveRoom(slug)`.
   - If `country == null` OR `getCountryConfig(country)` has no real config:
     `web_room_entry { outcome: 'degraded', slug }`; **do not** set country; fall through to normal
     flow (the country question will be asked). (FR-007)
   - Else (configured room country):
     - `UPDATE survey_profiles SET country = :country WHERE lead_id = :leadId`
     - `UPDATE leads SET acquisition_source = 'web:room:' || :country WHERE id = :leadId`
     - `web_room_entry { outcome: 'applied', slug, resolved_country: country }`
     - Then run the normal opening-message path (`handlePhase1(lead, '', undefined, cid)`).

## Invariants

- The handler MUST write country **before** invoking `handlePhase1`, so the survey (when it later
  starts) already sees the pre-answered field.
- The handler MUST NOT touch `survey_question_index`, gates, or any other lead state — only
  `survey_profiles.country` and `leads.acquisition_source`.
- Applying a room is idempotent: a second `GET ?room=ecuador` on the same brand-new-but-now-scoped
  lead hits branch 2 (country already set) and no-ops.
- Rate limiting (existing, keyed by `channelUserId`) applies unchanged to both branches.

## Tests

Unit (`tests/unit/*` or route test): branches 1/2/3 with a stubbed DB + `getCountryConfig`.
E2E (`tests/e2e/chat-country-room.spec.ts`):
- fresh browser → `GET /api/chat/web?room=ecuador` → `survey_profiles.country = 'Ecuador'`,
  `leads.acquisition_source = 'web:room:Ecuador'`
- same session → `GET /api/chat/web?room=mexico` → still Ecuador (branch 2)
- fresh browser → `GET /api/chat/web?room=guatemala` → country still null, no source (branch 3 degrade)
