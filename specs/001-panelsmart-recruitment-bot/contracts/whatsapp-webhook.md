# Contract: WhatsApp Webhook Handler (Meta Cloud API — primary)

**Primary transport**: WhatsApp Business Platform (Meta Cloud API).  
**Alternative**: Twilio WhatsApp — see `POST /api/webhooks/whatsapp/twilio` and
[`specs/003-whatsapp-twilio-provider/`](../../003-whatsapp-twilio-provider/).

**Endpoints**:
- `GET /api/webhooks/whatsapp` — Meta hub verification
- `POST /api/webhooks/whatsapp` — Meta inbound (when `WHATSAPP_PROVIDER=meta`, default)
- `POST /api/webhooks/whatsapp/twilio` — Twilio inbound (alternative)

Switch: `WHATSAPP_PROVIDER=meta|twilio` (default `meta`).

Domain code always uses `@/lib/messaging/send` — never Meta/Twilio SDKs directly.

---

## GET — Hub Verification (Meta)

| Parameter | Type | Description |
|-----------|------|-------------|
| `hub.mode` | string | Always `"subscribe"` |
| `hub.verify_token` | string | Must match `WHATSAPP_VERIFY_TOKEN` |
| `hub.challenge` | string | Echo back to confirm |

**200**: plain text `hub.challenge`  
**403**: token mismatch / Meta not configured

---

## POST — Inbound Message (Meta)

**Security**: Validate HMAC-SHA256 over raw body with `X-Hub-Signature-256` using
`WHATSAPP_APP_SECRET`. Reject `403` on failure.

**Meta requires `200 OK` within ~5s.** Processing runs in `after()`.

**Body** (simplified):
```json
{
  "object": "whatsapp_business_account",
  "entry": [{
    "changes": [{
      "value": {
        "messages": [{
          "from": "<phone_digits>",
          "id": "<message_id>",
          "type": "text",
          "text": { "body": "<user_message_text>" }
        }]
      }
    }]
  }]
}
```

Supported inbound types: `text`, `interactive` (button_reply / list_reply), `location`,
legacy `button`.

**Pipeline** (`after()`):
1. Normalize → `ChannelInbound` (E.164 `channelUserId`)
2. Upsert lead `(whatsapp, e164)`
3. Resolve `pendingWaChoices` for numbered replies
4. `routeMessage` → phase handlers
5. Outbound via Meta Graph (or Twilio if provider switch)

---

## Outbound Messages (Meta)

`POST https://graph.facebook.com/{WHATSAPP_GRAPH_VERSION}/{WHATSAPP_PHONE_NUMBER_ID}/messages`  
Auth: `Authorization: Bearer {WHATSAPP_ACCESS_TOKEN}`  
Default graph version: `v21.0`

| Domain method | Meta payload |
|---------------|--------------|
| `sendText` | `type: text` |
| `sendInlineKeyboard` (≤3) | `interactive` / `button` reply buttons |
| `sendInlineKeyboard` (4–10) | `interactive` / `list` |
| `sendInlineKeyboard` (>10 or failure) | Numbered text + `pendingWaChoices` |
| `sendVideo` | `type: video` with `link` (fallback: text link) |

**Template messages** (re-engagement outside 24h session): still required for production
cold outreach; register Meta-approved templates before launch (names TBD with TDM).

---

## Environment

| Variable | Required for Meta | Description |
|----------|-------------------|-------------|
| `WHATSAPP_PROVIDER` | no (default `meta`) | `meta` \| `twilio` |
| `WHATSAPP_ACCESS_TOKEN` | yes | Cloud API token |
| `WHATSAPP_PHONE_NUMBER_ID` | yes | Sending phone number id |
| `WHATSAPP_VERIFY_TOKEN` | yes | Hub verify token you choose |
| `WHATSAPP_APP_SECRET` | yes | App secret for signature |
| `WHATSAPP_GRAPH_VERSION` | no | Default `v21.0` |

Twilio alternative: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM`,
optional `TWILIO_WEBHOOK_URL`.
