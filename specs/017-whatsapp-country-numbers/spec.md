# Feature Specification: WhatsApp Country Numbers

**Feature Branch**: `feature/ecuador-mexico` (spec dir `017-whatsapp-country-numbers`)

**Created**: 2026-09-05

**Status**: Draft

**Input**: User description: "Dedicated per-country WhatsApp phone numbers for Ecuador and Mexico
(one number each, distinct from the existing CAM number), all under a single shared Meta WhatsApp
Business Account. Inbound routing by number identity, number→country scoping that pre-sets country
and skips the country question (reusing the feature 016 chat-rooms pattern), outbound FROM-number
selection threaded through the provider layer and all background jobs, config via a
number→country map, per-number Meta messaging-limit ramp-up, admin visibility, and tests including
a WhatsApp regression harness."

## Overview

Today the platform sends and receives WhatsApp through a **single business phone number** shared by
every market. A person messaging that number is asked "¿En qué país te encuentras?" as survey
question 2, exactly like Telegram and the generic web chat. With Ecuador (014) and Mexico (015) added
as configured countries, the business wants a **dedicated WhatsApp number for each of those two
markets** — a local Ecuador number and a local Mexico number — while the existing number continues to
serve the CAM/RD markets. A person who messages the Ecuador number is an Ecuador lead and must never
be asked which country they are in; the same for Mexico. The CAM number is unchanged and still asks.

All three numbers live under **one shared Meta WhatsApp Business Account (WABA)** and one Meta app:
one set of API credentials, one webhook, one signature secret, and one shared, already-approved
message-template inventory. What differs per number is its identity (which the inbound webhook
reports), the country it is scoped to, its independent Meta messaging limit / quality rating, and its
local display number.

This is the WhatsApp-channel analogue of feature 016's web "country rooms": the number takes the
place of the URL path segment as the thing that establishes the country up front.

## Clarifications

### Session 2026-09-05

- Q: Shared WABA or one WABA per number?
  → A: **Single shared WABA + shared Meta app.** One access token, one app secret, one webhook
  subscription, one template-approval inventory for all three numbers. Only the per-number identity,
  country mapping, and messaging limits differ. (This removes the need for any per-number credential
  storage or a country/WABA dimension on the template inventory.)
- Q: Which markets get a dedicated number in this feature?
  → A: **Ecuador and Mexico only.** The 7 CAM/RD markets keep sharing the existing number, which
  still asks the country question. Adding a number for another market later must be config-only.
- Q: What establishes the country for an inbound WhatsApp message?
  → A: **The business number the person messaged.** Ecuador number → Ecuador; Mexico number →
  Mexico; the shared CAM number → still ask the country question.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Person messages the Ecuador number and is never asked their country (Priority: P1)

A recruitment campaign in Ecuador publishes the local Ecuador WhatsApp number. A person messages it,
passes the opt-in / consent gate, and goes straight into the Ecuador questionnaire — the "¿En qué
país…?" question is never shown because the number already established the country as Ecuador. The
same holds for the Mexico number. A person messaging the existing CAM number sees no change and is
still asked the country question.

**Why this priority**: This is the core of the feature — a person who reached out on a country's own
number should not answer a question whose answer is already known, and should not be able to pick the
wrong country.

**Independent Test**: Send an inbound message that the webhook attributes to the Ecuador number;
confirm the resulting lead's country is Ecuador, the country question is never sent, and the
questionnaire, NSE scoring, and geography are Ecuador's. Repeat for Mexico. Send a message attributed
to the CAM number and confirm the country question is still asked with every supported country
offered.

**Acceptance Scenarios**:

1. **Given** a first-time contact on the Ecuador number, **When** they pass the consent gate, **Then**
   their lead is scoped to Ecuador and the first survey question after country is asked (name still
   asked; country not).
2. **Given** a lead on the Ecuador number, **When** the questionnaire proceeds, **Then** the wording,
   answer options, NSE scoring, and geography are Ecuador's (feature 014), not the CAM set.
3. **Given** a first-time contact on the shared CAM number, **When** the survey reaches the country
   step, **Then** they are asked "¿En qué país te encuentras?" with all supported countries offered
   (unchanged from today).
4. **Given** a lead on the Mexico number, **When** they complete the flow, **Then** the lead is
   recorded with country = México and flows through the Mexico quota / registration path.

---

### User Story 2 - Every reply and follow-up goes out from the number the person contacted (Priority: P1)

A person who wrote to the Mexico number receives every bot message — questionnaire prompts, the
registration link, the verification-code template, re-engagement nudges, reminders — **from that same
Mexico number**. A person on the CAM number keeps receiving everything from the CAM number. This holds
for messages sent by background jobs (re-engagement, code delivery, timeouts) that run with no
inbound request in hand.

**Why this priority**: Meta requires a business to reply on the same number the customer messaged.
Sending from a different number starts a new, un-initiated conversation — it breaks the 24-hour
customer-care window, confuses the recipient, and drives down the number's quality rating. A partial
implementation that only fixes live replies but not background jobs would silently regress.

**Independent Test**: For a lead on each number, trigger (a) a live questionnaire reply, (b) the
registration-link send, (c) the verification-code template send, and (d) a re-engagement job run;
confirm every outbound message is attributed to that lead's number and none to another number.

**Acceptance Scenarios**:

1. **Given** a lead whose conversation is on the Ecuador number, **When** the bot sends any message
   (live reply, template, keyboard, video, or link), **Then** it is sent from the Ecuador number.
2. **Given** a lead on the Mexico number who has gone quiet, **When** the re-engagement job sends its
   single allowed nudge, **Then** the nudge is sent from the Mexico number.
3. **Given** a lead on the CAM number, **When** any message is sent, **Then** it is sent from the CAM
   number — unchanged from today.
4. **Given** a lead whose number cannot be determined (legacy lead created before this feature),
   **When** the bot sends a message, **Then** it falls back to the shared CAM number and the fallback
   is logged, rather than failing to send.

---

### User Story 3 - Inbound messages are attributed to the right number (Priority: P1)

Every inbound WhatsApp message that arrives on the shared webhook is attributed to the specific
business number it was sent to, and that attribution is recorded on the conversation, so replies
(US2) and country scoping (US1) can use it.

**Why this priority**: US1 and US2 both depend on knowing which number an inbound message hit. The
shared webhook receives messages for all three numbers on one endpoint; without per-message
attribution the country scoping and reply routing have nothing to key on.

**Independent Test**: Post inbound webhook payloads for each of the three numbers to the single
webhook endpoint; confirm each resulting conversation records the number it arrived on, and that a
payload for an unknown number is handled gracefully (logged, treated as the shared CAM number).

**Acceptance Scenarios**:

1. **Given** the shared webhook endpoint, **When** an inbound message for the Ecuador number
   arrives, **Then** the conversation is recorded as belonging to the Ecuador number.
2. **Given** an inbound message whose target number is not in the configured number→country map,
   **When** it is processed, **Then** it is treated as the shared CAM number (country question asked)
   and the unrecognized number identity is logged.
3. **Given** the single shared signature secret, **When** any inbound payload arrives for any of the
   three numbers, **Then** signature verification succeeds using that one secret (no per-number
   secret).

---

### User Story 4 - Operator configures and monitors the numbers (Priority: P2)

An operator can see, from configuration and the admin area, which WhatsApp numbers exist, which
country each is scoped to, and (for launch planning) each number's current Meta messaging tier, so
they can run the phased ramp-up and hand the right number to each market's campaign. Adding a fourth
number later is a configuration change, not a code change.

**Why this priority**: Without visibility the operator cannot run the Meta-mandated ramp-up or know
which number to publish. Lower than P1 because a documented config value is a usable stopgap while the
admin view is built.

**Independent Test**: In the admin area, view the list of WhatsApp numbers with their country
mapping and display number; confirm adding a number to the configuration map (without code changes)
makes it routable inbound and selectable outbound.

**Acceptance Scenarios**:

1. **Given** the admin area, **When** the operator views the WhatsApp numbers list, **Then** each
   number shows its display number and the country it is scoped to (or "generic — asks country" for
   the shared CAM number).
2. **Given** a new number added to the number→country configuration map, **When** the system
   restarts / redeploys, **Then** inbound messages to it are country-scoped and outbound messages for
   its leads are sent from it, with no source-code change.
3. **Given** the admin numbers list, **When** the operator reviews it during ramp-up, **Then** each
   number's current messaging tier / quality signal is visible (or clearly marked "not available"
   if Meta does not expose it to the app).

---

### Edge Cases

- Inbound payload for a number not in the number→country map → treat as the shared CAM number (ask
  the country question), log the unknown number identity; never 500.
- A number mapped to a country whose `CountryConfig` is not present (e.g. Ecuador number active
  before 014 ships) → behave as the shared CAM number (ask the country question).
- Legacy lead created before this feature has no recorded number → outbound falls back to the shared
  CAM number, logged (US2 scenario 4).
- A person who previously messaged the CAM number (country already answered = México) later messages
  the Mexico number → the already-answered country stands; the conversation is not re-scoped and the
  bot does not silently move them. The number their **current** conversation is bound to for replies
  is a documented decision in planning (default: keep replying on the number the active conversation
  started on).
- The same person messages two different numbers → treated as the platform treats one WhatsApp
  identity today (one lead keyed on the sender's phone); which number owns the reply thread is the
  planning decision above.
- A country-scoped number receives a message but the person later uses the mid-conversation
  correction flow to change their country → `survey_profiles.country` updates and the flow continues
  with the corrected country's content, while the acquisition-source indicator still records the
  number the lead originally came in on (provenance preserved, matching feature 016).
- Outbound send for a lead whose mapped number is temporarily blocked / over its Meta limit → the
  send fails as it would today for the single number; no automatic failover to another number (that
  would violate the same-number reply rule). The failure is logged / retried per existing behavior.
- Meta re-delivers an inbound webhook (dedup) → unchanged; dedup key is the provider message id, not
  the number.
- The shared template inventory is used across all numbers → one approval covers all three; no
  per-number template state.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST attribute every inbound WhatsApp message to the specific business
  number it was sent to, using the identity supplied by the shared webhook payload.
- **FR-002**: The system MUST maintain a configurable mapping from business-number identity to
  country. Ecuador and Mexico numbers map to their countries; the shared CAM number maps to "no
  country — ask" (or is simply absent from the map, which means the same).
- **FR-003**: When a NEW WhatsApp conversation is created on a country-scoped number, the system MUST
  pre-set that conversation's country to the number's country and MUST NOT ask the "¿En qué país te
  encuentras?" question.
- **FR-004**: A conversation created on a country-scoped number MUST run the questionnaire, NSE
  scoring, geography resolution, and quota / registration path for that country exactly as if the
  person had selected it at the country question (reusing features 014 / 015; no parallel flow).
- **FR-005**: Inbound messages to the shared CAM number MUST continue to ask the country question,
  offering every supported country including Ecuador and Mexico.
- **FR-006**: Every outbound WhatsApp message for a lead — including messages sent by background jobs
  with no inbound request context (re-engagement, verification-code / registration-link delivery,
  reminders, timeouts) — MUST be sent from the business number that lead's conversation is bound to.
- **FR-007**: When a lead's bound number cannot be determined, outbound MUST fall back to the shared
  CAM number and MUST log the fallback, rather than failing to send or sending from an arbitrary
  number.
- **FR-008**: An inbound message to a business number not present in the number→country map MUST be
  handled as the shared CAM number (country question asked) and the unrecognized number identity
  MUST be logged; it MUST NOT cause an error response to Meta.
- **FR-009**: Signature verification for inbound webhooks MUST succeed for all three numbers using
  the single shared app secret; the feature MUST NOT introduce per-number secrets or tokens.
- **FR-010**: The message-template inventory MUST remain shared across all numbers (one approval set
  serves all three); the feature MUST NOT add a per-number or per-country dimension to template
  storage.
- **FR-011**: The number that established a conversation's country MUST be observable in logs and on
  the lead record (with an indication that the country came from a number rather than a user answer),
  for funnel analysis by acquisition source — consistent with feature 016's acquisition-source
  convention.
- **FR-012**: An existing conversation MUST NOT be re-scoped to a different country because the
  person later messages a different business number; the country already established on the
  conversation stands.
- **FR-013**: The system MUST let an admin user view the list of configured WhatsApp numbers, each
  with the country it is scoped to (or a "generic — asks country" marker) and a human-readable
  display number **when available** — the local display number is shown if a best-effort lookup
  provides it, otherwise the number's stable identifier is shown so the row is still usable.
- **FR-014**: Adding, removing, or re-mapping a WhatsApp number MUST be a configuration change only,
  requiring no source-code modification.
- **FR-015**: The feature MUST NOT change the conversation, questionnaire, scoring, or quota behavior
  for people on the shared CAM WhatsApp number, on Telegram, or on web chat.
- **FR-016**: The re-engagement cadence, single-attempt cap, opt-out handling, and 24-hour
  customer-care window behavior MUST be unchanged; per-number routing MUST NOT cause a message to be
  sent outside the window or beyond the existing attempt cap.
- **FR-017**: Each number's Meta messaging limit / quality tier MUST be surfaced to the operator for
  ramp-up planning where Meta exposes it to the app; where it is not exposed, the admin view MUST say
  so rather than show a wrong value.
- **FR-018**: The feature MUST include a WhatsApp-channel regression check that proves the shared CAM
  number's inbound routing, country question, outbound sends, and templates are byte-identical before
  and after the change.

### Key Entities *(include if feature involves data)*

- **WhatsApp business number**: a number identity as reported by Meta, plus a local display number, a
  scoped country (Ecuador, México, or none = "ask"), and an independent Meta messaging limit / quality
  rating. All numbers share one WABA, one app, one token, one secret, one template inventory. The
  number set is configuration-driven (Ecuador, Mexico, shared CAM today), not free-form user data.
- **Number→country map**: the configuration that assigns each business-number identity to a country
  (or to "ask"). The single place a WhatsApp number is switched on a country.
- **WhatsApp conversation / lead**: the existing WhatsApp-channel lead + survey profile. Gains a
  binding to the business number it arrived on, an early-set country when that number is
  country-scoped, and an acquisition-source indicator (`whatsapp:number:<country>` vs generic),
  mirroring feature 016's `web:room:<country>`.
- **Admin numbers list**: the admin-visible enumeration of configured WhatsApp numbers, their country
  mapping, display number, and (where available) messaging tier.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of new conversations started on the Ecuador or Mexico number reach the first
  post-country question without ever displaying the country question.
- **SC-002**: 100% of conversations started on a country-scoped number are recorded with that country
  and proceed through that country's questionnaire and quota path.
- **SC-003**: 100% of outbound messages — live replies and background-job messages alike — are sent
  from the business number their lead's conversation is bound to; 0 cross-number sends observed in a
  release audit.
- **SC-004**: 0 existing conversations are re-scoped to a different country as a result of this
  feature (verified by an audit of country changes on WhatsApp leads before / after release).
- **SC-005**: Shared CAM WhatsApp number, Telegram, and web-chat regression suites show zero behavior
  change after release.
- **SC-006**: `acquisition_source` is populated (`whatsapp:number:<country>`) for 100% of leads
  originating on a country-scoped number and is visible in the admin conversations view.
- **SC-007**: An operator can obtain the correct WhatsApp number for Ecuador or Mexico, and see its
  current messaging tier where Meta exposes it, from the admin area in under 30 seconds with no
  engineering help.
- **SC-008**: Adding a new country number is achieved by editing configuration only, with zero
  source-code changes, verified by adding a test number in a non-production environment.
- **SC-009**: An inbound payload for an unrecognized number is handled without a 5xx response to Meta
  in 100% of cases and is logged.

## Assumptions

- All three numbers are under one shared Meta WABA and one Meta app, sharing a single access token,
  app secret, webhook subscription, and approved template inventory. No per-number credentials are
  stored (Clarifications Q1).
- Only Ecuador and Mexico get a dedicated number in this feature; the 7 CAM/RD markets keep sharing
  the existing number, which still asks the country question (Clarifications Q2).
- The inbound webhook payload from Meta includes the identity of the business number the message was
  sent to; the platform will start reading that field (it is received today but not extracted).
- One WhatsApp identity = one lead, keyed on the sender's phone, unchanged. A person who contacts two
  different business numbers is still one lead; replies stay on the number that lead's active
  conversation started on (default; confirmed in planning).
- The country a number establishes is applied only at conversation creation (FR-003); an existing
  conversation is never re-scoped (FR-012). A person on a country number may still change the country
  via the normal correction flow, with acquisition source preserved (mirrors feature 016).
- The opt-in / consent gate, phone gate, sensitive-data consent, re-engagement rules, opt-out
  handling, and all downstream phases are unchanged; only the country question is skipped for
  country-number conversations.
- Meta template approval is per WABA; because the WABA is shared, one approved template set serves
  all three numbers and no template schema change is needed (FR-010).
- Meta messaging limits and quality ratings are per number; the phased ramp-up (already noted in
  014 / 015 launch-readiness tasks) is executed per number, not per platform.
- This feature depends on features 014 and 015 being merged (it reuses their `CountryConfig` registry
  and per-country flow) and on feature 016 (it reuses the acquisition-source and country-pre-set
  pattern). If a number targets a country whose config is not present, it degrades to "ask".
- Provisioning the actual Ecuador and Mexico phone numbers inside the Meta Business Manager (buying
  numbers, verifying them, registering them on the WABA, display-name approval) is an operational
  task done in the Meta console, not code; this feature consumes the resulting number identities via
  configuration.
- No change to the Twilio WhatsApp provider path; this feature targets the Meta Cloud API provider
  that is in use.

## Dependencies

- Feature `014-ecuador-onboarding` and `015-mexico-onboarding` (the `CountryConfig` registry and
  per-country questionnaire / scoring / quota flow).
- Feature `016-web-chat-country-rooms` (the acquisition-source convention and the "pre-set country,
  skip the country question" mechanism, reused here for the WhatsApp channel).
- The existing Meta WhatsApp Cloud API integration (single webhook, single provider, message-send
  facade) and the background jobs that send WhatsApp messages (re-engagement, code / link delivery).
- Operational: a shared Meta WABA with the Ecuador and Mexico numbers provisioned, verified, and
  registered, plus their display names approved.
- Platform constitution v1.2.0 — Principle V (country-scoped configuration, no scattered country
  branches — the number→country map is the single switch point) and Principle II (observability of
  the number that set the country and of every outbound send's from-number).
