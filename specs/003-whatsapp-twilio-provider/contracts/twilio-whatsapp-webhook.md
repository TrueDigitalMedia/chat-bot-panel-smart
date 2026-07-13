# Contract: Twilio WhatsApp Webhook

**Feature**: `003-whatsapp-twilio-provider`  
**Endpoint**: `POST /api/webhooks/whatsapp`  
**Provider**: Twilio WhatsApp Sandbox

---

## Security

- Validate `X-Twilio-Signature` with Auth Token over the **public** webhook URL + POST params (`twilio.validateRequest`).
- On failure: `403` and no processing.
- Prefer raw body / param map as Twilio documents for Next.js App Router (parse form data first, then validate).

---

## Request (Twilio → App)

`Content-Type: application/x-www-form-urlencoded`

| Param | Required | Notes |
|-------|----------|-------|
| `From` | yes | `whatsapp:+E164` |
| `To` | yes | Sandbox from-number |
| `Body` | often | Text body |
| `MessageSid` | yes | Idempotency / logs |
| `Latitude` / `Longitude` | no | Shared location |
| `ButtonText` / `ButtonPayload` | no | Interactive reply (if used) |

**Response**: `200` with empty TwiML or empty body within ~1s. Heavy work in `after()`.

---

## Normalization → ChannelInbound

```ts
{
  channel: 'whatsapp',
  channelUserId: '+50255551234', // From without whatsapp:
  text: Body ?? '',
  callbackData: mappedFromButtonOrPendingChoices ?? undefined,
  contactPhone: undefined, // phone = channel id
  location?: { latitude, longitude }
}
```

---

## Outbound (App → Twilio)

`POST https://api.twilio.com/2010-04-01/Accounts/{SID}/Messages.json`

| Field | Value |
|-------|--------|
| From | `TWILIO_WHATSAPP_FROM` |
| To | `whatsapp:{channelUserId}` |
| Body | message text |

Interactive: use Twilio content/quick-reply when implemented; else Body with numbered options + persist `pendingWaChoices`.

---

## Sandbox setup (ops)

1. Twilio Console → Messaging → Try WhatsApp → join code `join <word>` from tester phone.
2. Sandbox webhook “When a message comes in” → `https://<public-host>/api/webhooks/whatsapp` (POST).
3. Env: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM=whatsapp:+14155238886` (or current sandbox number).
