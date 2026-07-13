# Feature Specification: WhatsApp via Twilio Messaging Provider

**Feature Branch**: `003-whatsapp-twilio-provider`

**Created**: 2026-07-13

**Status**: Draft

**Input**: User description: "Integrar WhatsApp mediante Twilio como provider de integración, manteniendo la integración con Telegram"

## Clarifications

### Session 2026-07-13

- Q: ¿V1 solo Sandbox de Twilio o número WhatsApp Business de producción? → A: Option A — V1 usa **Twilio WhatsApp Sandbox** only. Account SID + Auth Token already available for env configuration. Production WhatsApp Business sender and cold-outbound templates are out of V1 (revisit after sandbox validation).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Panelist completes recruitment on WhatsApp (Priority: P1)

A potential panelist messages the business WhatsApp number (provisioned through Twilio). The same recruitment conversation used on Telegram runs on WhatsApp: decisions D1–D3, phone handling, survey (including geo GPS/manual when supported), and later phases. The panelist is stored as channel `whatsapp` with their phone as channel identity. Telegram continues to work independently for other users.

**Why this priority**: Opens the primary consumer channel for CAM recruitment without abandoning Telegram.

**Independent Test**: Send messages to the Twilio WhatsApp sandbox/number; complete D1–D3 and at least the first survey questions; verify lead `channel=whatsapp`, outbound replies arrive on WhatsApp, and a parallel Telegram conversation still works.

**Acceptance Scenarios**:

1. **Given** a user sends a WhatsApp message to the configured Twilio number, **When** the webhook receives it, **Then** a lead is upserted with `channel=whatsapp` and `channel_user_id` equal to the normalized phone, and the bot replies on WhatsApp with the next recruitment step.

2. **Given** a Telegram user is mid-flow, **When** a WhatsApp user starts a conversation, **Then** the Telegram session is unaffected (separate leads / channel identities).

3. **Given** WhatsApp inbound text or button reply, **When** the conversation router runs, **Then** the same domain flow (phase handlers) advances as on Telegram.

---

### User Story 2 - Twilio is the WhatsApp provider behind a channel port (Priority: P1)

Outbound and inbound WhatsApp traffic go through a **Twilio provider adapter**. Domain code keeps using the existing channel-agnostic messaging port (`sendText`, keyboards, phone/location helpers). Telegram remains its own adapter. Switching or adding providers later must not require rewriting survey/phase logic.

**Why this priority**: Avoids coupling the recruitment bot to Twilio SDK calls in every handler; preserves Telegram.

**Independent Test**: With Twilio credentials configured, outbound WhatsApp text succeeds via the messaging port; Telegram outbound still uses the Telegram adapter. Missing Twilio config fails WhatsApp only, not Telegram.

**Acceptance Scenarios**:

1. **Given** `channel=whatsapp`, **When** the bot calls `sendText`, **Then** the message is sent via Twilio WhatsApp API (not Telegram).

2. **Given** `channel=telegram`, **When** the bot calls `sendText`, **Then** behavior remains the existing Telegram Bot API path.

3. **Given** Twilio credentials are missing or invalid, **When** a WhatsApp send is attempted, **Then** the error is logged and scoped to WhatsApp; Telegram sending still works.

---

### User Story 3 - Interactive choices and media on WhatsApp (Priority: P2)

Survey buttons (Sí/No, country, etc.) and special prompts (phone already known on WA; location share when WhatsApp/Twilio supports it) work for WhatsApp users with channel-appropriate UX. Where WhatsApp cannot mirror Telegram reply keyboards exactly, the bot uses Twilio-supported interactive messages or a clear text fallback so the flow does not block.

**Why this priority**: Without choices, qualification and survey cannot complete on WhatsApp.

**Independent Test**: Exercise D1 accept/decline and a country selection on WhatsApp; verify callbacks/replies map into the same `callbackData` / field values as Telegram.

**Acceptance Scenarios**:

1. **Given** the bot needs a Yes/No decision on WhatsApp, **When** it sends interactive options, **Then** the user’s selection advances the flow equivalently to Telegram inline buttons.

2. **Given** a WhatsApp user (phone = channel id), **When** they pass D3, **Then** phone capture is skipped/auto-filled from the WhatsApp identity (existing product rule).

3. **Given** the geo step requests location on WhatsApp, **When** Twilio delivers a location message or the user chooses to type, **Then** the NSE geo gate behaves per feature `002` rules (GPS confirm / manual / allowlist).

---

### User Story 4 - Operators see WhatsApp conversations in the monitor (Priority: P3)

The conversation monitor lists and opens WhatsApp leads with channel badge `whatsapp`, phone identity, and the same inbound/outbound message timeline as Telegram.

**Why this priority**: Ops must support multi-channel without separate tools.

**Independent Test**: Complete a short WA exchange; open `/conversations` and the lead detail; verify channel and messages.

**Acceptance Scenarios**:

1. **Given** a WhatsApp lead with logged messages, **When** an operator opens the conversation, **Then** they see channel `whatsapp`, phone/user id, and chronological in/out messages.

---

### Edge Cases

- Duplicate Twilio webhook delivery → processing must be idempotent enough not to double-advance critical steps (or safely no-op on duplicates).
- User messages outside the WhatsApp 24-hour customer care window → outbound free-form may fail; system must log clearly and use approved templates only if configured for that V1 (see Assumptions).
- Media (images/stickers) without text → bot asks for text or offers FAQ/support path without crashing.
- Twilio signature validation failure → reject with 403; do not process.
- Same phone messaging both WA and somehow conflicting ids → identity is `(channel, channel_user_id)`; WhatsApp and Telegram never merge automatically in V1.
- Video onboarding on WA → send as Twilio media URL when configured; if unsupported, send link as text fallback.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST accept inbound WhatsApp messages via a Twilio webhook and normalize them into the existing `ChannelInbound` model (`channel=whatsapp`).

- **FR-002**: The system MUST send outbound WhatsApp messages through a Twilio WhatsApp provider adapter invoked only when `channel=whatsapp`.

- **FR-003**: The system MUST keep the existing Telegram adapter and webhook fully operational; enabling WhatsApp MUST NOT require disabling Telegram.

- **FR-004**: Domain conversation code MUST continue to call the channel-agnostic messaging port; it MUST NOT call Twilio APIs directly from phase handlers.

- **FR-005**: WhatsApp leads MUST use `(channel=whatsapp, channel_user_id=<E.164 phone>)` as identity; phone MAY be auto-populated from that id for the phone gate.

- **FR-006**: Interactive survey/decision options MUST be deliverable on WhatsApp (Twilio interactive messages and/or numbered text fallback) and user replies MUST map to the same logical choices as Telegram callbacks.

- **FR-007**: Inbound WhatsApp location messages MUST be normalized to the existing ephemeral `location` field when present so the geo gate can run; if location request is unavailable, the bot MUST offer the manual geo path.

- **FR-008**: Twilio webhook requests MUST be authenticated (Twilio request signature validation) before processing.

- **FR-009**: Conversation monitor MUST display WhatsApp leads and messages with correct channel labeling.

- **FR-010**: Configuration for Twilio (account, auth, WhatsApp from-number / Messaging Service) MUST be environment-driven and documented; Telegram env vars remain unchanged.

- **FR-011**: This feature MUST NOT redesign Phases 2–4 business logic, MUST NOT replace Telegram, and MUST NOT implement Meta Cloud API as the WhatsApp transport (Twilio is the provider).

### Key Entities

- **Messaging provider**: Pluggable outbound/inbound adapter for a channel (Telegram Bot API; Twilio WhatsApp).

- **WhatsApp session (Twilio)**: A conversation identified by the user’s WhatsApp phone number on the Twilio-connected sender.

- **Lead (unchanged model)**: Already multi-channel via `(channel, channel_user_id)`.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A new panelist can complete D1–D3 and at least survey questions through email on WhatsApp without using Telegram.

- **SC-002**: 100% of Telegram regression smoke (start → D1) still passes with WhatsApp enabled.

- **SC-003**: Invalid Twilio signatures are rejected; no lead mutation occurs on those requests.

- **SC-004**: Operators can identify WhatsApp vs Telegram leads in the monitor without reading raw DB rows.

- **SC-005**: Adding Twilio WhatsApp does not require code changes inside individual phase handlers beyond the messaging port / inbound normalization (provider isolation).

## Assumptions

- Twilio WhatsApp **Sandbox** is the V1 transport (not a production WABA sender). Account SID and Auth Token are provided by the team for env setup; From-number is the Twilio sandbox WhatsApp sender (e.g. `whatsapp:+14155238886` pattern).
- Within the customer-care window after the user messages the sandbox, free-form session messages are used; Meta/Twilio content templates for cold outbound are out of V1.
- Existing Meta WhatsApp Cloud API contract in `001` is superseded for implementation by Twilio; that old contract is historical.
- Phone on WhatsApp equals channel user id (E.164); no separate contact-share step.
- Interactive buttons: prefer Twilio content/interactive APIs; if a control cannot be mapped, numbered list text fallback is acceptable for V1.
- Video: URL media send via Twilio when possible; otherwise text link.
- Web channel remains unimplemented.

## Out of Scope

- Meta WhatsApp Cloud API direct integration (non-Twilio).
- Merging Telegram and WhatsApp identities into one lead.
- Building a second recruitment flow unique to WhatsApp.
- Fase 8 Bloque 2/3 product fixes.
- Disabling or rewriting Telegram integration.
