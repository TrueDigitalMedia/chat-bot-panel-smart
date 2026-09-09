# Implementation Plan: Web Chat Country Rooms

**Branch**: `feature/ecuador-mexico` (spec dir `016-web-chat-country-rooms`) | **Date**: 2026-09-03 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/016-web-chat-country-rooms/spec.md`

## Summary

Add two country-scoped entry points to the public web chat — `/chat/ecuador` and `/chat/mexico` —
that pre-scope a **new** visitor's conversation to that country so the "¿En qué país te encuentras?"
survey question is never shown. Bare `/chat` and the Telegram/WhatsApp channels are unchanged. An
existing conversation is never re-scoped by a room URL. Admins get a small page listing the two room
URLs with copy buttons.

Technical approach: a new dynamic route segment `src/app/chat/[room]/page.tsx` validates the slug
against a 2-entry `chat-rooms.ts` registry (`ecuador → Ecuador`, `mexico → México`) and renders the
existing `<ChatWindow>` with a `roomSlug` prop; unknown slugs fall through to the generic page. The
client forwards `?room=<slug>` **only on the bootstrap `GET /api/chat/web`**. That handler, when it is
creating a brand-new lead, resolves the slug → canonical country, writes `survey_profiles.country`
immediately, and stamps `leads.acquisition_source = 'web:room:<country>'`; for any existing lead the
`room` param is ignored. The survey then skips its country question via a **new send-time helper**
`nextQuestionToSend` that **this feature adds** to `survey-plan.ts` (the module feature 014 creates):
it skips a question that is either already answered (a room's `country`) or a geo question this
country does not ask (CAM's `neighborhood`, `geoHierarchy` label `null`). The resolved question list
is unchanged — the helper only decides which positions are sent — so in-flight `survey_question_index`
values stay valid and the four copy-pasted `neighborhood` skips collapse into this one helper. Room
leads use manual geo entry (no GPS gate); everything after country is the existing per-country
014/015 flow.

## Technical Context

**Language/Version**: TypeScript 5.x (strict), Node.js 20, Next.js 15 App Router

**Primary Dependencies**: Next.js App Router (route segments, server components), Drizzle ORM, Neon
Postgres, Vitest, Playwright. Reuses `@/lib/web/*`, `@/lib/conversation/*`, `@/lib/countries/*`.

**Storage**: Neon Postgres via Drizzle. One small migration `0017_web_chat_rooms.sql`
(`leads.acquisition_source`) — numbered after 014's `0015` and 015's optional `0016`. No other schema
change.

**Testing**: Vitest unit (room registry, bootstrap param behavior, `nextQuestionToSend` no-op for
CAM); Playwright E2E (`/chat/ecuador` skips country; **bare `/chat` still asks** — this is
the generic-web regression check; existing lead not re-scoped; room lead can still correct country);
the existing CAM golden-master regression suite (Telegram) must stay green after the `survey-plan.ts`
change.

**Target Platform**: Vercel (Next.js app + serverless route handlers).

**Project Type**: Web application — single `src/` tree.

**Performance Goals**: No added latency — the room adds one registry lookup + one column write at
lead creation only.

**Constraints**: Zero behavior change for bare `/chat`, Telegram, WhatsApp (FR-012). Never re-scope an
existing conversation (FR-005). Room degrades to generic for unknown / unconfigured country (FR-007).

**Scale/Scope**: 2 rooms; 1 dynamic route + 1 admin page; 1 registry module; 1 migration; 1 new
helper in `survey-plan.ts` replacing 4 copy-pasted skips; ~6 modified files.

**Dependencies**: features `014-ecuador-onboarding` + `015-mexico-onboarding` (the `CountryConfig`
registry, `resolveSurveyQuestions`, and the EC/MX questionnaires) and `012-web-chat-channel` (the
`/chat` page, `web_session_id`, `processChatTurn`). If a room's country has no `CountryConfig` yet,
the room degrades to generic (FR-007) — so 016 is expected to land after 014/015.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Constitution v1.2.0.

| Principle | Assessment |
|-----------|------------|
| I. AI Safety & Guardrails | PASS — no new LLM surface. The room only pre-fills a field the user would otherwise type; the opt-in consent gate still runs (FR-010). No new PII path. |
| II. Observability First | PASS (with work) — plan adds a `web_room_entry` structured log (`slug`, `resolved_country`, `outcome` ∈ `applied` \| `existing_lead_ignored` \| `degraded`) and `leads.acquisition_source` for funnel attribution, surfaced in the admin leads view (FR-011, SC-006). |
| III. Simplicity / YAGNI | PASS — no parallel flow. The only new abstraction is a 2-row room registry + one pure helper (`nextQuestionToSend`). It **replaces** the `neighborhood` skip currently copy-pasted across 4 files with a single call — a net simplification, no list/index changes. URL is a plain route segment, no new routing infra. |
| IV. Flexible Quota Eligibility | PASS — untouched. Room leads reach the quota engine with a country + NSE level exactly as a self-selected lead would. |
| V. Country-Scoped Recruitment Configuration | PASS — the slug→country map is one small registry; no `if (country===…)` added to shared paths. Room leads run the standard `getCountryConfig(country)` flow. Bare `/chat` regression + CAM golden-master prove nothing else moved. |

**T026 self-review (post-implementation):**
- **Principle V** — the only new country-name branch is `resolveRoom` in
  `src/lib/web/chat-rooms.ts` (a 2-entry slug→country map). `applyRoomParam` and the
  room page call `getCountryConfig` / `isSupportedCountry`, never `if (country === …)`.
  `nextQuestionToSend` is a pure function of the (unchanged) resolved list + geo labels.
- **Principle II** — `web_room_entry` is logged in all three outcomes (unit-asserted in
  `chat-web-room-param.test.ts`) with a **hashed** session id; `leads.acquisition_source`
  is surfaced + filterable in `/admin/conversations` (T021).
- **No-op for existing flows (FR-012 / SC-005)** — the CAM golden-master suite shows the
  only snapshot change is the new `acquisition_source: null` column (no transcript / index
  / scoring diff); the bare-`/chat` "still asks country" path is E2E-verified
  (`chat-country-room.spec.ts`); the 4 copy-pasted `neighborhood` skips are now one call.
- Retired 4 duplicated skips → one `nextQuestionToSend`; a latent phase-1.ts bug
  (`if (finalIdx === 5)` unconditional) is gone as a side effect.

No violations. Complexity Tracking not required.

## Project Structure

### Documentation (this feature)

```text
specs/016-web-chat-country-rooms/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── chat-room-registry.md
│   ├── web-bootstrap-room-param.md
│   └── survey-preanswered-skip.md
└── tasks.md            # /speckit-tasks output (not here)
```

### Source Code (repository root)

```text
src/app/chat/
├── page.tsx                       # UNCHANGED — generic room (renders <ChatWindow />)
├── chat-window.tsx                # MODIFIED — accept `roomSlug?` prop, forward as ?room= on bootstrap GET
└── [room]/
    └── page.tsx                   # NEW — validate slug via chat-rooms registry; hit → <ChatWindow roomSlug=…/>, miss → render the generic layout (never 404)

src/lib/web/
├── session.ts                     # UNCHANGED
├── process-turn.ts                # UNCHANGED (POST path needs no room awareness)
└── chat-rooms.ts                  # NEW — { ecuador: 'Ecuador', mexico: 'México' }; resolveRoom(slug), roomUrl(country)

src/app/api/chat/web/route.ts      # MODIFIED — GET reads ?room=; on brand-new lead only: set survey_profiles.country + leads.acquisition_source; log web_room_entry

src/lib/conversation/
├── survey-plan.ts                 # MODIFIED (016 adds to 014's module) — add `nextQuestionToSend` (skips answered fields + geo questions with a null geoHierarchy label); `resolveSurveyQuestions` unchanged
├── send-survey-question.ts        # MODIFIED — call the shared helper instead of the inline `neighborhood` special-case
├── geo/handle-confirm.ts          # MODIFIED — same: drop the inline `neighborhood` skip
├── phases/phase-1.ts              # MODIFIED — advance path respects pre-answered fields; GPS gate skipped when country already set
└── gps-capture.ts                 # MODIFIED — `needsGpsCapture` returns false when `survey_profiles.country` is set (room lead → manual geo)

src/app/admin/
├── admin-sidebar.tsx              # MODIFIED — add "Salas / Rooms" link
└── rooms/
    ├── page.tsx                   # NEW — list Ecuador + Mexico room URLs
    └── copy-link.tsx              # NEW — client copy-to-clipboard button

src/lib/db/schema.ts               # MODIFIED — leads.acquisition_source varchar(40)
src/lib/db/migrations/0017_web_chat_rooms.sql   # NEW  (next free number after 014 0015 + 015 optional 0016)

tests/unit/chat-rooms.test.ts                   # NEW
tests/unit/survey-preanswered-skip.test.ts      # NEW
tests/unit/chat-web-room-param.test.ts          # NEW
tests/e2e/chat-country-room.spec.ts             # NEW  (rooms + bare-/chat-still-asks + correction)
# (no new tests/regression journey — bare-/chat is covered by the E2E above; the CAM
#  golden-master already proves the survey-plan.ts change is a no-op for Telegram)
```

**Structure Decision**: Single `src/` web-app tree. One new route segment, one new admin page, one
tiny lib registry, one column. The country-question skip is a pure helper added to `survey-plan.ts`
(014's module) — a shared mechanism, not a 016-specific `if (country===…)` branch. **014 is unchanged
by this** (its send-time Q5 backstop keeps working until 016 lands, then 016 removes it — coordinate
merge order; if 016 somehow lands first, 014's T009/T011 must not re-add a `neighborhood` skip).

## Phase 0: Research

See [research.md](./research.md). Resolved items:

- R1. How the room's country reaches the backend (route segment + `?room=` on bootstrap GET only).
- R2. New-lead vs existing-lead detection in the bootstrap handler (reuse the "no messages yet" check
  that already gates the opening message).
- R3. Skipping the country question — 016 adds `nextQuestionToSend` to `survey-plan.ts` (skips
  answered fields + null-geo-label questions), replacing the 4 copy-pasted `neighborhood` skips; the
  question list itself is unchanged. vs. a 016-local special case.
- R4. GPS gate for room leads — disable it (room leads enter geo manually) for this feature;
  GPS-for-geo in a room, with country locked, is a documented follow-up.
- R5. Acquisition source storage (`leads.acquisition_source` vs `flow_states` vs jsonb).
- R6. Slug ⇄ canonical country name mapping and the URL builder (needs `APP_BASE_URL`).
- R7. Sequencing vs. 014/015 and the FR-007 degrade path.
- R8. Regression coverage — add a bare-`/chat` "still asks country" journey.

## Phase 1: Design & Contracts

- [data-model.md](./data-model.md) — `leads.acquisition_source`, the `chat-rooms` registry shape, the
  `resolveSurveyQuestions` pre-answered-skip rule, room-lead state notes, observability event.
- [contracts/chat-room-registry.md](./contracts/chat-room-registry.md) — `resolveRoom(slug)` /
  `roomUrl(country)` / the fixed room set / degrade rules.
- [contracts/web-bootstrap-room-param.md](./contracts/web-bootstrap-room-param.md) —
  `GET /api/chat/web?room=<slug>` behavior: new lead (pre-set country + source + log) vs existing lead
  (ignore), and the response shape (unchanged).
- [contracts/survey-preanswered-skip.md](./contracts/survey-preanswered-skip.md) — `nextQuestionToSend`
  (016 adds it to `survey-plan.ts`): skips a question that is already answered (a room's `country`) or
  a geo question this country does not ask (null `geoHierarchy` label — CAM's `neighborhood`);
  `survey_question_index` advances past it, the list is unchanged. Replaces the 4 copy-pasted
  `neighborhood` skips; must be a no-op for existing CAM / Telegram / WhatsApp flows.
- [quickstart.md](./quickstart.md) — open `/chat/ecuador` in a fresh browser (country skipped);
  bare `/chat` still asks; existing lead + room URL not re-scoped; admin rooms page; log checks;
  regression suites.

**Agent context update**: no `CLAUDE.md` / `update-agent-context` script present; nothing to update.

### Post-design Constitution re-check

Unchanged — all five principles PASS. The country-question skip is generalized, not special-cased;
the room map is a single registry; observability and the no-re-scope guarantee are designed in.

## Complexity Tracking

Not required — no constitution violations.
