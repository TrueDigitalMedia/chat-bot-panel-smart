# Implementation Plan: WhatsApp via Twilio Messaging Provider

**Branch**: `003-whatsapp-twilio-provider` | **Date**: 2026-07-13 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/003-whatsapp-twilio-provider/spec.md`

## Summary

Enable **WhatsApp** recruitment through a **Twilio WhatsApp Sandbox** provider adapter, while **keeping Telegram** unchanged. Inbound Twilio webhooks normalize to `ChannelInbound` (`channel=whatsapp`); outbound goes through the existing messaging port (`sendText`, keyboards, location helpers) via a Twilio adapter. Phone auto-fills from WhatsApp E.164 identity. Interactive choices use Twilio-friendly UX (prefer quick-reply / numbered fallback). No Meta Cloud API; no production WABA in V1.

## Technical Context

**Language/Version**: TypeScript / Node.js 20+ — Next.js 16 (App Router), strict mode.

**Primary Dependencies**:
- Existing: Next.js, Drizzle, Neon, Telegram adapter, conversation router
- New: `twilio` npm package (request signature validation + Messages API) **or** `fetch` + manual HMAC for signatures — **Decision: official `twilio` package** for signature helper + send Message (research.md)

**Storage**: Existing `leads` / `conversation_messages` — no new tables required for V1 (channel enum already includes `whatsapp`).

**Testing**: Vitest for signature validation helpers, inbound normalization, button mapping. Manual sandbox quickstart. Playwright webhook smoke optional.

**Target Platform**: Vercel serverless + Twilio WhatsApp Sandbox + existing Telegram bot.

**Project Type**: Web service (single Next.js app).

**Performance Goals**: Twilio webhook ACK within ~1s (`after()` deferred processing, same pattern as Telegram).

**Constraints**:
- V1 = Sandbox only (`TWILIO_WHATSAPP_FROM` like `whatsapp:+14155238886`).
- Free-form session messages after user opts into sandbox; no cold templates in V1.
- Telegram must keep working if Twilio env is missing (WhatsApp sends fail closed for WA only).
- Do not call Twilio from phase handlers.

**Scale/Scope**: Same concurrent conversation model as Telegram; sandbox limited to joined testers.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

### I. AI Safety & Guardrails ✅
- No new LLM surface; same phase handlers / sanitization as Telegram.
- Inbound text still passes existing sanitize/FAQ paths.

### II. Observability First ✅
- Log Twilio inbound (MessageSid, From), signature failures, outbound MessageSid / errors.
- Monitor already multi-channel — ensure WA messages logged via messaging port.

### III. Simplicity / YAGNI ✅
- One Twilio adapter; Sandbox only; numbered/quick-reply fallback instead of building a full Content Template CMS.
- Complexity Tracking: empty.

**Post-design re-check**: ✅ Provider isolation; no unjustified new services.

## Project Structure

### Documentation (this feature)

```text
specs/003-whatsapp-twilio-provider/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── twilio-whatsapp-webhook.md
│   └── messaging-provider-port.md
└── tasks.md   # /speckit-tasks
```

### Source Code (repository root)

```text
src/lib/messaging/
├── send.ts                 # wire whatsapp → twilio adapter
└── provider.ts             # optional thin types / dispatch helpers

src/lib/whatsapp/           # NEW Twilio provider (name = channel, transport = Twilio)
├── send.ts                 # text, media, interactive/fallback
├── verify.ts               # validateRequest
├── normalize-inbound.ts    # Twilio form → ChannelInbound
└── buttons.ts              # map InlineKeyboard → WA UX

src/app/api/webhooks/whatsapp/
└── route.ts                # POST Twilio webhook (form-urlencoded)

src/lib/env.ts              # TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM, TWILIO_AUTH_TOKEN for signature
.env.example                # document sandbox join + webhook URL
```

**Structure Decision**: Mirror `src/lib/telegram/` with `src/lib/whatsapp/` implementing Twilio transport; keep `src/lib/messaging/send.ts` as the only domain entrypoint.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| — | — | — |
