---
description: "Task list for WhatsApp Twilio provider"
---

# Tasks: WhatsApp via Twilio Messaging Provider

**Input**: Design documents from `specs/003-whatsapp-twilio-provider/`

**Prerequisites**: plan.md ✅ | spec.md ✅ | research.md ✅ | data-model.md ✅ | contracts/ ✅

**Tests**: Unit tests for normalize + button map; webhook smoke optional.

## Format: `[ID] [P?] [Story?] Description`

---

## Phase 1: Setup

- [X] T001 Install `twilio` dependency in `package.json`
- [X] T002 [P] Document optional Twilio env vars in `.env.example` (Account SID, Auth Token, WhatsApp From, webhook URL)
- [X] T003 Extend `src/lib/env.ts` with optional `TWILIO_*` vars so Telegram boots without Twilio

---

## Phase 2: Foundational

- [X] T004 Add `pendingWaChoices` JSONB to `flow_states` in `src/lib/db/schema.ts` + migration `src/lib/db/migrations/0008_wa_pending_choices.sql`
- [X] T005 [P] Implement Twilio signature verify in `src/lib/whatsapp/verify.ts`
- [X] T006 [P] Implement inbound normalize `src/lib/whatsapp/normalize-inbound.ts` (From/Body/Lat/Lon → ChannelInbound)
- [X] T007 [P] Implement numbered/quick-reply button mapping in `src/lib/whatsapp/buttons.ts`
- [X] T008 Implement outbound send helpers in `src/lib/whatsapp/send.ts` (text, media URL, keyboard fallback)
- [X] T009 Wire WhatsApp branches in `src/lib/messaging/send.ts` (keep Telegram paths)
- [X] T010 Create `POST /api/webhooks/whatsapp/route.ts` (validate → upsertLead → routeMessage via `after()`)

**Checkpoint**: WA webhook + outbound text path exist; Telegram unchanged.

---

## Phase 3: User Story 1 — Recruitment on WhatsApp (P1) 🎯 MVP

**Goal**: Full funnel inbound/outbound on Sandbox.

- [X] T011 [US1] Resolve pending numbered choices into `callbackData` in webhook/normalize before `routeMessage`
- [X] T012 [US1] Ensure WhatsApp phone auto-fill via existing `resolveWhatsAppPhone` / `needsPhoneCapture` when starting survey
- [X] T013 [US1] Extend restart greetings if needed in `src/lib/conversation/flow-router.ts` for common WA openers (`hola`, etc. already partially covered)
- [X] T014 [P] [US1] Vitest for normalize-inbound + button map in `src/lib/whatsapp/*.test.ts`

**Checkpoint**: Sandbox user can pass D1–D3 and start survey.

---

## Phase 4: User Story 2 — Provider isolation (P1)

- [X] T015 [US2] Guard: if Twilio not configured, WhatsApp send throws clear error; Telegram send still works in `src/lib/messaging/send.ts` / `src/lib/whatsapp/send.ts`
- [X] T016 [US2] Log outbound MessageSid / errors with `[whatsapp:out]` without leaking Auth Token

---

## Phase 5: User Story 3 — Choices + location (P2)

- [X] T017 [US3] `sendInlineKeyboard` on WA persists `pendingWaChoices` and sends numbered body via `src/lib/whatsapp/buttons.ts` + `send.ts`
- [X] T018 [US3] `sendLocationRequest` on WA sends text prompt (share pin / type manual) in `src/lib/messaging/send.ts`
- [X] T019 [US3] Inbound location Lat/Lon maps to `ChannelInbound.location` for GPS gate

---

## Phase 6: User Story 4 — Monitor (P3)

- [X] T020 [US4] Confirm conversation logging works for WA via messaging port (adjust log channel if needed) in `src/lib/messaging/send.ts` / webhook inbound logs
- [X] T021 [P] [US4] Verify list UI already shows `channel` badge — smoke only / no change if OK in `src/app/conversations/page.tsx`

---

## Phase 7: Polish

- [X] T022 [P] Apply migration 0008 on Neon
- [X] T023 Document Sandbox join + webhook in `specs/003-whatsapp-twilio-provider/quickstart.md` (already present — verify)
- [X] T024 Mark tasks complete after validation notes

---

## Dependencies

Setup → Foundational → US1/US2 → US3 → US4 → Polish

**MVP**: T001–T014

**Next**: `/speckit-implement`
