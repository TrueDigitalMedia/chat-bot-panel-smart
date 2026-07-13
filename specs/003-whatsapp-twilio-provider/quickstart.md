# Quickstart: WhatsApp Twilio Sandbox

**Feature**: `003-whatsapp-twilio-provider`  
**Date**: 2026-07-13

---

## Prerequisites

- Twilio Account SID + Auth Token (you already have these)
- Twilio WhatsApp Sandbox enabled
- Public HTTPS URL to the app (ngrok / Vercel) for webhook
- Telegram still configured (regression)

**Env** (add to `.env`, never commit secrets):

```bash
TWILIO_ACCOUNT_SID=ACxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxx
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886
APP_BASE_URL=https://<your-public-host>
# Optional override for signature URL:
# TWILIO_WEBHOOK_URL=https://<your-public-host>/api/webhooks/whatsapp
```

---

## Twilio Console

1. Messaging → Try it out → WhatsApp → Sandbox settings.
2. “When a message comes in”: `https://<host>/api/webhooks/whatsapp` (HTTP POST).
3. From your phone: send the sandbox join code to the Twilio sandbox number.
4. Then send `Hola` or `/start`.

---

## Scenarios

### A — WA happy path (smoke)

1. Join sandbox; message `Hola`.
2. Expect D1 T&C on WhatsApp.
3. Tap/reply accept → D2 → D3 → phone skipped → name question.
4. Monitor: lead `channel=whatsapp`, messages in timeline.

### B — Telegram regression

1. `/start` on Telegram bot.
2. Expect D1 as today; no errors from missing WA activity.

### C — Signature reject

1. POST forged form to webhook without valid signature → `403`.

### D — Location (optional)

1. Reach GPS gate on WA; share location pin or choose manual path.
2. Expect geo confirm / allowlist behavior from feature 002.

---

## Logs to check

- `[whatsapp:in]` From, MessageSid
- `[whatsapp:out]` To, sid / error
- `[whatsapp:signature] invalid` on failures
