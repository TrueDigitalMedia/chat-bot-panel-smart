# Feature Specification: Web Chat Country Rooms

**Feature Branch**: `feature/ecuador-mexico` (spec dir `016-web-chat-country-rooms`)

**Created**: 2026-09-03

**Status**: Draft

**Input**: User description: "spec it as 016-web-chat-country-rooms" — a follow-up to features
014-ecuador-onboarding and 015-mexico-onboarding: the public `/chat` web page should offer a
country-scoped entry point ("room"). Scope narrowed in Clarifications to **Ecuador and Mexico only**;
the CAM/RD markets keep the generic `/chat`.

## Overview

Today `/chat` is a single public page: any visitor opens it, gets one anonymous conversation per
browser, and the bot asks "¿En qué país te encuentras?" as survey question 2. With Ecuador (014) and
Mexico (015) added as configured countries, the research team wants **country-scoped chat links** they
can hand to recruiters and campaigns in those two markets — an Ecuador campaign links to `/chat/ecuador`
and a Mexico campaign links to `/chat/mexico`, and every visitor who lands there is already scoped to
that country and is never asked which country they are in. The 7 CAM/RD markets keep using the generic
`/chat`, which still asks the country question.

A "room" here is a **country-scoped entry URL and landing page for a single visitor's own
conversation** — not a multi-user chat space. It changes which country the conversation is pre-set to
(and whether the country question is shown), plus optional market-appropriate page copy. Everything
after country selection is the existing questionnaire flow, driven per country by the
`014`/`015` configuration.

## Clarifications

### Session 2026-09-03

- Q: What is the room granularity — one room per region-group, or one per individual country?
  → A: **Only Ecuador and Mexico get country rooms.** They skip the country question. The 7 CAM/RD
  markets keep using the generic `/chat` (which still asks "¿En qué país te encuentras?").
- Q: How is a room addressed in the URL?
  → A: **Path segment** — `/chat/ecuador` and `/chat/mexico`, with bare `/chat` as the generic room.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Visitor lands on a country room and is never asked their country (Priority: P1)

A recruiter shares the Ecuador room link. A visitor opens it, sees a short market-appropriate intro,
accepts the consent gate, and goes straight into the Ecuador questionnaire — the "¿En qué país…?"
question is not shown because the room already established the country as Ecuador. The same holds for
the Mexico room.

**Why this priority**: This is the whole point of the feature — a campaign in one market should not
make its visitors answer a question whose answer is already known, and should not risk a visitor
picking the wrong country.

**Independent Test**: Open the Ecuador room URL in a fresh browser; confirm the conversation's country
is Ecuador, the country question never appears, and the questionnaire shown is the Ecuador one; repeat
for Mexico; confirm a visitor on the generic `/chat` is still asked the country question.

**Acceptance Scenarios**:

1. **Given** a fresh browser, **When** the visitor opens the Ecuador room and passes the consent
   gate, **Then** their conversation is scoped to Ecuador and the first survey question they see is
   the one *after* country (name is still asked; country is not).
2. **Given** a visitor in the Ecuador room, **When** the questionnaire proceeds, **Then** the
   questions, wording, NSE scoring, and geography are Ecuador's (per feature 014), not the CAM set.
3. **Given** a visitor opens the generic `/chat` (no country in the URL), **When** the survey
   reaches the country step, **Then** they are asked "¿En qué país te encuentras?" with all supported
   countries offered (unchanged from today plus the Ecuador/Mexico buttons from 014/015).
4. **Given** a visitor in the Mexico room, **When** they complete the flow, **Then** the lead is
   recorded with country = México and flows through the Mexico quota/registration path.

---

### User Story 2 - Returning visitor stays in their room (Priority: P1)

A visitor who started in the Ecuador room closes the tab and comes back later (same browser). Their
existing conversation resumes exactly where it left off, still scoped to Ecuador — reopening the room
link, or even the bare `/chat`, does not reset their country or restart the conversation.

**Why this priority**: The web channel's core promise (spec 012) is that a browser's conversation
persists. A country room must not break that or silently re-scope an in-progress lead.

**Independent Test**: Start a conversation in the Ecuador room, answer a few questions, reload the
room URL and separately the bare `/chat` URL; confirm the transcript and country are preserved and no
restart/opening message is re-sent.

**Acceptance Scenarios**:

1. **Given** an in-progress conversation started in the Ecuador room, **When** the visitor reopens
   the Ecuador room URL, **Then** the full transcript resumes and the country is still Ecuador.
2. **Given** the same in-progress Ecuador conversation, **When** the visitor instead opens the bare
   `/chat` URL, **Then** the conversation still resumes as Ecuador (the room that created it wins; the
   bare URL does not re-scope or re-ask).
3. **Given** an in-progress conversation started on the generic `/chat` where the visitor already
   answered country = Guatemala, **When** the visitor later opens the Mexico room URL, **Then** the
   conversation is NOT re-scoped to Mexico — the already-answered country stands, and the visitor is
   told (or simply continues) rather than being silently moved.
4. **Given** a conversation started in the Ecuador room (country pre-set to Ecuador), **When** the
   visitor uses the mid-conversation correction flow to change their country to Guatemala, **Then**
   `survey_profiles.country` updates to Guatemala and the flow continues with Guatemala content, while
   `acquisition_source` still records `web:room:Ecuador` (the room provenance is preserved, not the
   final country).

---

### User Story 3 - Recruiter/admin gets the room links (Priority: P2)

The research team can see and copy the canonical URL for each country room from the admin area, so
they can attach the right link to each market's campaign, QR code, or recruiter script.

**Why this priority**: The rooms are useless if the team has to guess or hand-build the URLs;
operationally this is how the feature gets adopted. Lower than P1 because a documented URL convention
is a usable stopgap.

**Independent Test**: In the admin area, view the list of country rooms with their full URLs and a
copy action; open a copied link and confirm it lands on the right room.

**Acceptance Scenarios**:

1. **Given** the admin area, **When** the user views the country-rooms list, **Then** the Ecuador and
   Mexico rooms each show their canonical room URL with a one-click copy.
2. **Given** a copied room URL, **When** it is opened in a browser, **Then** it resolves to that
   country's room (or a clear "unknown room" fallback if the country slug is wrong).

---

### Edge Cases

- Unknown / misspelled country slug in the URL (`/chat/ecuadorr`), or a CAM-country slug that has no
  room (`/chat/guatemala`) → fall back to the generic room (ask the country question) rather than
  404, and log the slug.
- A room for a country that is not yet configured (no `CountryConfig`, e.g. Ecuador room opened
  before 014 ships) → behave as the generic room.
- Visitor manually edits the URL mid-conversation to a different country room → treated the same as
  US2 scenario 3 (existing country stands; no silent re-scope).
- Visitor in a room realizes the pre-set country is wrong → they use the normal mid-conversation
  correction flow to change it (US2 scenario 4). The room does not lock the country against
  correction.
- A room link opened by a visitor who has already been disqualified / completed → resumes to their
  terminal state, unchanged, same as `/chat` today.
- Bot/crawler hits a room URL → same anonymous-session behavior as `/chat` today (spec 012); no new
  surface.
- Room landing page must not itself act as a consent — the existing opt-in gate still runs (FR-010).
- Geo entry for a room lead is **manual** (Provincia/Estado → …). The GPS / location-sharing step is
  **not offered** in a room (planning R4). Re-enabling GPS-for-geo in a room — with the country locked
  to the room and the existing country-mismatch handling applied — is a documented follow-up, out of
  scope for this feature.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST accept a country-scoped `/chat` entry point addressed by URL path
  segment — `/chat/ecuador` and `/chat/mexico` — that identifies a target country for the visitor's
  conversation. Bare `/chat` is the generic room.
- **FR-002**: When a NEW conversation is created via a country room, the system MUST pre-set that
  conversation's country to the room's country and MUST NOT ask the "¿En qué país te encuentras?"
  question.
- **FR-003**: A conversation created via a country room MUST run the questionnaire, NSE scoring,
  geography resolution, and quota/registration path for that country, exactly as if the visitor had
  selected it at the country question (reusing features 014 / 015; no parallel flow).
- **FR-004**: The generic `/chat` entry point (no country in the URL) MUST continue to ask the
  country question, offering every supported country including Ecuador and Mexico.
- **FR-005**: An EXISTING conversation MUST NOT be re-scoped to a different country because the
  visitor later opens a different room URL or the bare `/chat`; the country already established on the
  conversation stands.
- **FR-006**: Reopening any `/chat` URL (room or bare) for an existing conversation MUST resume the
  transcript and MUST NOT re-send the opening/consent message or restart the flow (unchanged from
  spec 012 behavior).
- **FR-007**: An unrecognized or not-yet-configured country slug MUST degrade to the generic room
  (ask the country question), not error, and MUST be logged.
- **FR-008**: Each country room MUST have a single canonical, stable, shareable URL.
- **FR-009**: The system MUST let an admin user view the canonical URL for each country room (Ecuador
  and Mexico) with a copy action.
- **FR-010**: This feature ships the room landing page with the **same copy as the generic `/chat`
  page** (no per-market intro text). If market-appropriate intro copy is added in a later iteration,
  it MUST NOT substitute for or pre-satisfy the opt-in consent gate — the opt-in gate always runs for
  a room visitor.
- **FR-011**: The country established by a room MUST be observable in logs and on the lead record
  (with an indication that it came from a room rather than a user answer), for funnel analysis by
  acquisition source.
- **FR-012**: The feature MUST NOT change the conversation, questionnaire, scoring, or quota behavior
  for visitors on the generic `/chat` or on the Telegram / WhatsApp channels.

### Key Entities *(include if feature involves data)*

- **Country room**: a country-scoped entry point — a canonical URL (`/chat/<slug>`), a target country
  (Ecuador or México; must be a supported `CountryConfig` country), and optional landing copy. The
  room set is fixed (Ecuador, Mexico), not free-form.
- **Web conversation / lead**: the existing web-channel lead + survey profile (spec 012). Gains an
  early-set country when created via a room, plus an acquisition-source indicator ("web room:
  <country>" vs "web").
- **Room link list**: the admin-visible enumeration of country rooms and their URLs.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of new conversations started from the Ecuador or Mexico room reach the first
  post-country question without ever displaying the country question.
- **SC-002**: 100% of conversations started from a country room are recorded with that country and
  proceed through that country's questionnaire and quota path.
- **SC-003**: 0 existing conversations are re-scoped to a different country as a result of this
  feature (verified by an audit of country changes on web leads before/after release).
- **SC-004**: A recruiter can obtain the correct room link for any supported market from the admin
  area in under 30 seconds, with no engineering help.
- **SC-005**: Generic `/chat`, Telegram, and WhatsApp regression suites show zero behavior change
  after release.
- **SC-006**: `leads.acquisition_source` is populated (`web:room:<country>`) for 100% of
  room-originated leads and is visible in the admin leads view, so the research team can attribute at
  least 95% of room-originated web leads to their room. (Deeper marketing attribution — UTM, campaign
  ids — is out of scope; see Assumptions.)

## Assumptions

- "Room" = a country-scoped single-visitor entry point, not a multi-user chat space. The web channel
  stays one anonymous conversation per browser (spec 012).
- Only two rooms exist: `/chat/ecuador` and `/chat/mexico`. Bare `/chat` is the generic room and is
  unchanged except that its country question now also offers Ecuador/Mexico (from 014/015). The 7
  CAM/RD markets have no room.
- The country established by a room is applied only at conversation creation (FR-002); an existing
  conversation is never re-scoped (FR-005) or restarted (FR-006). A room visitor may still change the
  pre-set country via the normal correction flow.
- Room slugs map to the canonical `CountryConfig` country names from features 014 / 015 —
  `ecuador` → `Ecuador`, `mexico` → `México`.
- The consent (opt-in) gate, phone gate, and all downstream phases are unchanged; only the country
  question is skipped for room-originated conversations, and (per R4) the GPS/location step is not
  offered — room leads enter geo manually.
- No new authentication — rooms are public, same as `/chat` today.
- This feature depends on features 014 and 015 being merged (it reuses their `CountryConfig` registry
  and per-country questionnaire/scoring). If a room targets a country whose config is not present, it
  degrades to the generic room.
- Landing-page copy per room, if included, is minimal (a one-line market-appropriate intro); full
  per-market branding/theming is out of scope for this feature.
- Marketing attribution beyond "which room" (UTM parameters, campaign ids) is out of scope; it can be
  layered on later using the same acquisition-source field.

## Dependencies

- Feature `014-ecuador-onboarding` and `015-mexico-onboarding` (the `CountryConfig` registry and
  per-country flow).
- Feature `012-web-chat-channel` (the `/chat` page, web session, `processChatTurn`).
- Platform constitution v1.2.0 — Principle V (country-scoped configuration, no scattered country
  branches) and Principle II (observability of the room-set country).
