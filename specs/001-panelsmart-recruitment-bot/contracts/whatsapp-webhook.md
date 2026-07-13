# Contract: WhatsApp Webhook Handler

> ⚠️ **PAUSED** — WhatsApp integration is paused. Active channel is now Telegram.
> See [`telegram-webhook.md`](telegram-webhook.md). This file is preserved for
> reference when WhatsApp is re-enabled.

**Endpoint**: `POST /api/webhooks/whatsapp`
**Also handles**: `GET /api/webhooks/whatsapp` (Meta hub verification)

---

## GET — Hub Verification

Used by Meta to verify webhook ownership during setup.

**Query parameters**:
| Parameter | Type | Description |
|-----------|------|-------------|
| `hub.mode` | string | Always `"subscribe"` |
| `hub.verify_token` | string | Must match `WHATSAPP_VERIFY_TOKEN` env var |
| `hub.challenge` | string | Echo back to confirm |

**Response (200 OK)**:
```
hub.challenge value (plain text)
```

**Response (403 Forbidden)**: Token mismatch.

---

## POST — Inbound Message

Meta delivers incoming WhatsApp messages to this endpoint.

**Security**: Every request MUST be validated with HMAC-SHA256 over the raw body bytes
using `X-Hub-Signature-256` header before JSON parsing. Reject with `403` on failure.

**Meta requires a `200 OK` response within 5 seconds.** Processing is deferred via
`after()` / `waitUntil` to avoid timeout.

**Request body** (Meta Cloud API format, simplified to relevant fields):
```json
{
  "object": "whatsapp_business_account",
  "entry": [{
    "id": "<WABA_ID>",
    "changes": [{
      "value": {
        "messages": [{
          "from": "<phone_e164>",
          "id": "<message_id>",
          "timestamp": "<unix_ts>",
          "type": "text",
          "text": { "body": "<user_message_text>" }
        }],
        "contacts": [{
          "profile": { "name": "<display_name>" },
          "wa_id": "<phone_e164>"
        }]
      }
    }]
  }]
}
```

**Response (200 OK)**: Always `{ "status": "received" }` — returned immediately.

**Processing pipeline** (runs via `after()`):
1. Extract `phone_number` and `message_text` from payload.
2. Upsert Lead record (create on first contact, update `last_activity_at`).
3. Cancel any pending re-engagement timers for this lead.
4. Route to the appropriate phase handler based on `lead_status`.
5. Call LLM layer if extraction is needed.
6. Update `lead_status` and `FlowState`.
7. Send outbound reply via WhatsApp Send Message API.
8. Log `LLMCallLog` entries for all AI calls made.

---

## Outbound Messages

Outbound messages are sent via Meta Cloud API REST endpoint.

**Endpoint**: `POST https://graph.facebook.com/v19.0/{PHONE_NUMBER_ID}/messages`

**Auth**: `Authorization: Bearer {WHATSAPP_ACCESS_TOKEN}`

**Free-form message** (within 24h conversation window):
```json
{
  "messaging_product": "whatsapp",
  "to": "<phone_e164>",
  "type": "text",
  "text": { "body": "<message_text>" }
}
```

**Template message** (re-engagement, outside 24h window):
```json
{
  "messaging_product": "whatsapp",
  "to": "<phone_e164>",
  "type": "template",
  "template": {
    "name": "<approved_template_name>",
    "language": { "code": "es" },
    "components": [{
      "type": "body",
      "parameters": [{ "type": "text", "text": "<variable_value>" }]
    }]
  }
}
```

**Required Meta-approved templates** (to be registered before launch):
| Template name | Phase | Trigger |
|---------------|-------|---------|
| `panelsmart_reengagement_1` | Any | 75-min inactivity |
| `panelsmart_reengagement_2` | Any | 7-hour inactivity |
| `panelsmart_reengagement_3` | Any | 20-hour inactivity |
| `panelsmart_code_delivery` | F2 | Registration code delivery |
