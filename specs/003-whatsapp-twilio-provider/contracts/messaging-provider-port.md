# Contract: Messaging provider port

**Feature**: `003-whatsapp-twilio-provider`

Domain modules import **only** `@/lib/messaging/send` (and related helpers). They never import `@/lib/telegram/*` or `@/lib/whatsapp/*` directly.

## Port methods (existing + WA behavior)

| Method | Telegram | WhatsApp (Twilio) |
|--------|----------|-------------------|
| `sendText` | Bot API | Twilio Message Body |
| `sendInlineKeyboard` | Inline keyboard | Quick-reply / numbered fallback + `pendingWaChoices` |
| `sendPhoneRequest` | Contact keyboard | No-op / skip (phone = WA id) |
| `sendLocationRequest` | `request_location` keyboard | Text prompt to share pin or type manually |
| `sendVideo` | sendVideo | Twilio media URL or link fallback |
| `confirmPhoneSaved` / `confirmLocationKeyboardRemoved` | remove reply keyboard | `sendText` equivalent |

## Isolation rule

- Missing Twilio env → WhatsApp methods throw/log; Telegram methods unaffected.
- Adding another WhatsApp provider later = new adapter + switch in `send.ts`, not phase rewrites.
