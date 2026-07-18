# Contract: Messaging provider port

**Feature**: `003-whatsapp-twilio-provider` (updated for Meta primary)

Domain modules import **only** `@/lib/messaging/send` (and related helpers). They never import `@/lib/telegram/*` or `@/lib/whatsapp/*` provider internals directly.

## Port methods

| Method | Telegram | WhatsApp (Meta Cloud API — default) | WhatsApp (Twilio — alternative) |
|--------|----------|-------------------------------------|----------------------------------|
| `sendText` | Bot API | Graph `type: text` | Twilio Message Body |
| `sendInlineKeyboard` | Inline keyboard | Interactive buttons / list + `pendingWaChoices` | Content API quick-reply / list + fallback |
| `sendPhoneRequest` | Contact keyboard | No-op / skip (phone = WA id) | No-op / skip |
| `sendLocationRequest` | `request_location` keyboard | Text prompt to share pin or type manually | Same |
| `sendVideo` | sendVideo | Graph `type: video` / link fallback | Twilio media URL or link fallback |
| `confirmPhoneSaved` / `confirmLocationKeyboardRemoved` | remove reply keyboard | `sendText` equivalent | `sendText` equivalent |

## Provider switch

- `WHATSAPP_PROVIDER=meta` (default) → Meta Cloud API adapters under `src/lib/whatsapp/providers/meta/`
- `WHATSAPP_PROVIDER=twilio` → Twilio adapters under `src/lib/whatsapp/providers/twilio/`
- Facade: `src/lib/whatsapp/send.ts` + webhooks under `/api/webhooks/whatsapp` (Meta) and `/api/webhooks/whatsapp/twilio` (Twilio)

## Isolation rule

- Missing active-provider env → WhatsApp methods throw/log; Telegram methods unaffected.
- Adding another WhatsApp transport = new adapter under `providers/` + switch in facade — not phase rewrites.
