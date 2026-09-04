# Phase 0 Research: Web Chat Country Rooms

Context: `src/app/chat/page.tsx` (generic), `src/app/chat/chat-window.tsx` (client widget),
`src/app/api/chat/web/route.ts` (`GET` bootstrap + `POST` turn), `src/lib/web/session.ts`
(`web_session_id` cookie → `upsertLead('web', sessionId)`), `src/lib/conversation/phases/phase-1.ts`
(opt-in → D1 → D3 → phone gate → survey), `src/lib/conversation/gps-capture.ts` (GPS gate before the
country question), `src/lib/conversation/send-survey-question.ts` (the hard-coded Q5 `neighborhood`
skip).

## R1. How the room's country reaches the backend

**Decision**: a dynamic route segment `src/app/chat/[room]/page.tsx`. It looks the slug up in
`chat-rooms.ts`; a hit renders `<ChatWindow roomSlug={slug} />`, a miss renders the same output as the
generic page (no slug). `<ChatWindow>` appends `?room=<slug>` **only to its bootstrap
`GET /api/chat/web` call** — never to `POST` turns. The `GET` handler is the only place a room does
anything.
**Rationale**: keeps the client change to one prop + one query-string append; the POST path
(`processChatTurn`) stays untouched; the country is persisted once at creation so later turns need no
room context.
**Alternatives**: query param on `/chat?pais=` (rejected in spec clarification — path segment chosen);
a header from the client (rejected — query param is simpler and visible in logs); a cookie set by the
room page (rejected — would leak the room across tabs / the bare URL, breaking FR-005).

## R2. New-lead vs existing-lead detection

**Decision**: the bootstrap `GET` already computes `existing = await fetchAllMessages(lead.id)` and
only sends the opening message when `existing.length === 0`. Reuse exactly that signal: apply the
room's country **only when `existing.length === 0` AND `surveyProfiles.country` is currently null**.
Any existing conversation (has messages, or already has a country) ignores `?room=`.
**Rationale**: one source of truth for "brand-new conversation"; no new state; satisfies FR-005/FR-006
(reopening a room URL, or the bare URL, for an in-progress lead changes nothing).
**Alternatives**: check `leads.createdAt` freshness (rejected — racy, and a stale unstarted lead
should still be claimable by a room); a dedicated `room_applied` flag (rejected — YAGNI, the
country-null check is sufficient and self-healing).

## R3. Skipping the country question

**Decision**: generalize the existing Q5 skip. Feature 014's `survey-plan.ts` gains a rule: **a
resolved survey question whose `fieldName` already holds a non-null value on `survey_profiles` when
the survey reaches that index is not sent; the persisted `survey_question_index` advances past it**
(recursively, so consecutive pre-answered fields all skip). `send-survey-question.ts` and the three
advance paths stop hard-coding `neighborhood` and call this instead. A room lead has
`survey_profiles.country` set before the survey starts → the country question self-skips. Q1
(`fullName`) is still asked (null at creation).
**Rationale**: the Q5 skip is currently copy-pasted in `send-survey-question.ts`, `handle-confirm.ts`,
`phase-1.ts`, and `gps-capture.ts` (each file notes "a new path could miss its own copy"). One rule
removes that fragility and gives 016 its behavior for free. `neighborhood` keeps skipping for CAM
because 014's `camConfig.geoHierarchy.neighborhoodLabel` is null → the field is written null →
pre-answered-skip covers it (or `survey-plan` still filters null-label questions; see contract).
**Alternatives**: a 016-local `if (field === 'country' && profile.country) skip` in each advance path
(rejected — adds to the exact fragility 014 is trying to reduce; Principle III); a per-country
`scoringQuestions`-style "prefix override" (rejected — over-engineered for one skipped question).

## R4. GPS gate for room leads

**Decision**: `needsGpsCapture(lead)` returns **false when `survey_profiles.country` is already set**.
Room leads go straight to manual geo (Q3 = provincia/estado). The GPS gate exists mainly to
auto-detect *country* + department; with country fixed and Ecuador/Mexico geo being manual-hierarchy
anyway (Provincia→Cantón→Parroquia / Estado→Municipio→CP), skipping it is the simple correct choice
for the MVP.
**Rationale**: avoids a GPS flow that could resolve to a different country than the room and trigger
the country-mismatch path on turn one; keeps the room flow linear.
**Alternatives**: run GPS but lock the country to the room's (rejected for MVP — extra branching in
`gps-capture.ts` for marginal geo-accuracy gain; can be a follow-up: "GPS-for-geo in a room").
**Follow-up noted**: allow location share inside a room purely to prefill provincia/cantón, keeping
the room's country. Not in this feature.

## R5. Acquisition-source storage

**Decision**: add `leads.acquisition_source varchar(40)` — values `web:room:Ecuador`,
`web:room:México`, or null (generic `/chat`, Telegram, WhatsApp; treated as the implicit default).
Set once, at lead creation via a room. Migration `0017_web_chat_rooms.sql` (numbered after 014's
`0015` and 015's optional roster `0016`).
**Rationale**: `leads` is where funnel/attribution queries already live (dashboard, sync); one nullable
column, no backfill. Covers FR-011 / SC-006.
**Alternatives**: `flow_states` (rejected — that table is conversation-runtime state, not
lead-provenance); a jsonb `meta` on `leads` (rejected — no such column today, and a typed column is
queryable for reporting); a separate `lead_sources` table (rejected — YAGNI for one value per lead).
**Extensibility**: UTM/campaign attribution later can widen the column's vocabulary or add siblings
without touching this design.

## R6. Slug ⇄ country name & URL builder

**Decision**: `src/lib/web/chat-rooms.ts`:
```
export const CHAT_ROOMS = { ecuador: 'Ecuador', mexico: 'México' } as const
export function resolveRoom(slug: string): string | null   // canonical CountryConfig country name or null
export function roomUrl(country: string): string           // `${APP_BASE_URL}/chat/${slug}`
```
Slugs are lowercase, ASCII, accent-free (`mexico`, not `méxico`). `roomUrl` uses `env.APP_BASE_URL`
(already in `env.ts`, optional) and falls back to a relative `/chat/<slug>` when unset (admin page
shows a note).
**Rationale**: tiny fixed map, one import for both the route segment and the admin page (one source of
truth for FR-008).
**Alternatives**: derive slugs by slugifying every `CountryConfig` country (rejected — the spec fixes
the room set to EC + MX; CAM countries must NOT get rooms).

## R7. Sequencing vs. 014/015 and the degrade path

**Decision**: 016 lands **after** 014 + 015. If `resolveRoom(slug)` returns a country for which
`getCountryConfig` has no real config (shouldn't happen post-014/015, but guards a partial deploy),
the bootstrap handler logs `web_room_entry` with `degraded: true` and does **not** pre-set the
country — the lead falls through to the normal country question (FR-007). The `[room]/page.tsx` route
also renders the generic widget for any unknown slug (FR-007, no 404).
**Rationale**: safe under partial rollout; matches FR-007 exactly.
**Alternatives**: block the route until config exists (rejected — a 404 is worse UX than "asks the
question").

## R8. Regression coverage

**Decision**: extend the CAM golden-master suite (`tests/regression/`, from the CAM regression
analysis) with one **web-channel** journey: a bare-`/chat` conversation that reaches the country
question and is shown it with all buttons. Snapshot it pre-016; assert unchanged post-016. Also add a
Playwright `tests/e2e/chat-country-room.spec.ts` for the room paths.
**Rationale**: FR-012 / SC-005 require proof the generic web flow is untouched; the golden-master
harness already drives `routeMessage` and just needs `channel: 'web'` inbounds.
**Alternatives**: rely on the existing shallow `tests/e2e/web-chat.spec.ts` (rejected — it's a
webhook-shape smoke test, not behavioral).
