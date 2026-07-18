# Research: WhatsApp via Twilio Messaging Provider

**Feature**: `003-whatsapp-twilio-provider`  
**Date**: 2026-07-13  
**Status**: Complete

---

## Decision 1: Transport = Meta Cloud API primary; Twilio alternative (updated 2026-07-17)

**Original Decision (2026-07-13)**: Implement WhatsApp exclusively through Twilio Messages API with Sandbox sender.

**Update (2026-07-17)**: **Primary** transport is **WhatsApp Business Cloud API (Meta)** under
`src/lib/whatsapp/providers/meta/`. Twilio remains an **alternative** behind
`WHATSAPP_PROVIDER=twilio` and `POST /api/webhooks/whatsapp/twilio`. Domain code still uses only
`@/lib/messaging/send`.

**Rationale**: Product requirement to use WhatsApp Business API directly; Twilio kept for sandbox /
fallback without rewriting phase handlers.

**Alternatives considered**:
- Twilio-only — superseded; kept as switchable alternative.
- Dual simultaneous providers without a switch — rejected (ambiguous inbound ownership).

---

## Decision 2: Official `twilio` package

**Decision**: Add `twilio` dependency for `twilio.validateRequest` and `client.messages.create`.

**Rationale**: Signature validation is security-critical; official helper avoids HMAC mistakes. Send API is thin REST but SDK is standard on Node.

**Alternatives considered**:
- Raw `fetch` + manual HMAC — fewer deps but easy to get wrong with URL/proxy differences on Vercel. Rejected for V1.

---

## Decision 3: Webhook shape

**Decision**: `POST /api/webhooks/whatsapp` accepts `application/x-www-form-urlencoded` Twilio params (`From`, `To`, `Body`, `MessageSid`, `Latitude`, `Longitude`, `ButtonPayload` / `ButtonText` / `ListId` as available). Validate signature using Auth Token + full public webhook URL. Return `200` quickly; process with `after()`.

**Rationale**: Twilio’s default WhatsApp webhook format; mirrors Telegram deferred pattern.

---

## Decision 4: Interactive buttons mapping

**Decision**:
1. Prefer Twilio **quick reply** / interactive message when ≤3 options and short labels.
2. Otherwise send **numbered list** in text (`1) … 2) …`) and accept reply as number or exact label mapped to `callback_data`.
3. Store pending keyboard map on `flow_states` JSONB (e.g. `pendingWaChoices`) when using numbered fallback so the next inbound text can resolve to `callbackData`.

**Rationale**: Sandbox interactive support varies; numbered fallback never blocks the funnel. Domain keeps Telegram `callback_data` semantics.

**Alternatives considered**:
- Content Template SID per button set — heavy ops for V1. Rejected.
- Only free text without choices — breaks D1/country. Rejected.

---

## Decision 5: Identity & phone

**Decision**: `From` like `whatsapp:+50255551234` → strip prefix → `channelUserId=+50255551234`, `channel=whatsapp`. Reuse `resolveWhatsAppPhone` / skip phone prompt.

**Rationale**: Already designed in phone-capture; Spec FR-005.

---

## Decision 6: Location

**Decision**: If Twilio posts `Latitude`/`Longitude`, set `ChannelInbound.location`. `sendLocationRequest` on WhatsApp = text prompt asking to share location pin or type “Escribir mi ubicación” / proceed manual (Twilio may not support Telegram-style request_location keyboard).

**Rationale**: Aligns with geo feature 002; Sandbox location share is user-initiated pin.

---

## Decision 7: Env vars

**Decision**:
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_WHATSAPP_FROM` (e.g. `whatsapp:+14155238886`)
- Optional `TWILIO_WEBHOOK_URL` — absolute public URL used for signature validation if request URL behind proxy differs; default construct from `APP_BASE_URL` + `/api/webhooks/whatsapp`

Telegram vars unchanged. Missing Twilio vars: WhatsApp webhook returns 503/configured-off; Telegram unaffected.

---

## Decision 8: Restart command on WhatsApp

**Decision**: Treat inbound body matching `/start`, `hola`, `empezar`, `reiniciar` like Telegram restart patterns already in flow-router (extend if needed for `join` sandbox keyword — ignore Twilio sandbox system messages that are not user intent).

**Rationale**: Users won’t type Telegram slash commands necessarily; keep existing restart regex + common greetings.
