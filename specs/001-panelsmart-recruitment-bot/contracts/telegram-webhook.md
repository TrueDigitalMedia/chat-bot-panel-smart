# Contract: Telegram Webhook Handler

**Endpoint**: `POST /api/webhooks/telegram`

WhatsApp integration is **paused**. The bot now runs on Telegram via the Bot API.

---

## Webhook Registration

Register the webhook URL with Telegram once at deploy time:

```
POST https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/setWebhook
Content-Type: application/json

{
  "url": "https://<your-vercel-domain>/api/webhooks/telegram",
  "secret_token": "<TELEGRAM_WEBHOOK_SECRET>",
  "allowed_updates": ["message"]
}
```

Telegram will POST every incoming message to this URL.

---

## POST — Inbound Message

**Security**: Telegram sends `X-Telegram-Bot-Api-Secret-Token` header on every request.
Validate it matches `TELEGRAM_WEBHOOK_SECRET` env var before processing. Reject with `403`
on mismatch. No HMAC computation needed — the secret token check is sufficient.

**Telegram requires a `200 OK` response quickly.** Processing is deferred via Next.js 15's
`after()` / `waitUntil` to avoid re-delivery.

**Request body** (Telegram Update object, simplified to relevant fields):
```json
{
  "update_id": 123456789,
  "message": {
    "message_id": 42,
    "from": {
      "id": 987654321,
      "is_bot": false,
      "first_name": "María",
      "username": "maria_test",
      "language_code": "es"
    },
    "chat": {
      "id": 987654321,
      "type": "private"
    },
    "date": 1751900000,
    "text": "<user_message_text>"
  }
}
```

**Key fields**:
| Field | Used as |
|-------|---------|
| `message.chat.id` | `telegram_chat_id` — primary lead identifier |
| `message.from.username` | `telegram_username` — display only |
| `message.text` | User message content |
| `message.date` | Last activity timestamp (Unix) |

**Response (200 OK)**: `{}` — returned immediately.

**Processing pipeline** (runs via `after()`):
1. Validate `X-Telegram-Bot-Api-Secret-Token` header.
2. Extract `chat_id`, `username`, and `text` from payload.
3. Upsert Lead record (create on first contact, update `last_activity_at`).
4. Cancel any pending re-engagement timers for this lead.
5. Route to the appropriate phase handler based on `lead_status`.
6. Call LLM layer if extraction is needed.
7. Update `lead_status` and `FlowState`.
8. Send reply via Telegram `sendMessage` API.
9. Log `LLMCallLog` entries for all AI calls made.

---

## Outbound Messages

**Base URL**: `https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/{method}`

**Auth**: Bot token in the URL path — no `Authorization` header needed.

### Send text message

```
POST https://api.telegram.org/bot{TOKEN}/sendMessage
Content-Type: application/json

{
  "chat_id": 987654321,
  "text": "<message_text>",
  "parse_mode": "Markdown"
}
```

### Send video (onboarding / thank-you video)

```
POST https://api.telegram.org/bot{TOKEN}/sendVideo
Content-Type: application/json

{
  "chat_id": 987654321,
  "video": "<file_id_or_url>",
  "caption": "<optional_caption>"
}
```

### Send inline keyboard (yes/no prompts for hard filters)

```json
{
  "chat_id": 987654321,
  "text": "¿Administras las compras del hogar?",
  "reply_markup": {
    "inline_keyboard": [[
      { "text": "Sí", "callback_data": "manages_purchases:yes" },
      { "text": "No", "callback_data": "manages_purchases:no" }
    ]]
  }
}
```

Callback query responses are handled via `POST /api/webhooks/telegram` with
`message.callback_query` instead of `message.text`.

---

## Re-engagement Notifications

Unlike WhatsApp, **Telegram has no session window restriction and no template approval
process**. The bot can send messages to any user who has previously started a conversation
at any time, using free-form text.

Re-engagement messages use the same `sendMessage` endpoint with pre-written copy.
No external approval or template registration is required.

**Re-engagement cadence** (unchanged from original design):
| Attempt | Delay from last activity | Message |
|---------|--------------------------|---------|
| 1st | 75 minutes | Friendly reminder to continue |
| 2nd | 7 hours | Follow-up with value reminder |
| 3rd | 20 hours | Final attempt before `abandono` |

---

## Environment Variables

```
TELEGRAM_BOT_TOKEN=<bot_token_from_botfather>
TELEGRAM_WEBHOOK_SECRET=<random_secret_for_header_validation>
```

No `WHATSAPP_*` variables are needed while WhatsApp is paused.
