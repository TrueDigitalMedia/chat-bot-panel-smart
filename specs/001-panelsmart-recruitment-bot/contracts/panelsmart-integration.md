# Contract: PanelSmart External API Integration

The system makes one outbound call to the PanelSmart API to trigger registration code
delivery. This document defines the integration contract from the chatbot's perspective.

---

## PATCH /external/panelsmart/registration-code

Triggers the delivery of a registration code to the user via WhatsApp.

**Called by**: The chatbot after the 10-minute app-download window expires without
account activation.

**Endpoint**: Provided by Treinta/PanelSmart (environment variable `PANELSMART_API_URL`).

**Auth**: Bearer token (`PANELSMART_API_KEY` env var).

**Request**:
```json
PATCH {PANELSMART_API_URL}/panelists/{lead_id}/registration-code
Authorization: Bearer {PANELSMART_API_KEY}
Content-Type: application/json
Idempotency-Key: {lead_id}

{
  "phone_number": "+521234567890",
  "channel": "telegram"
}
```

**Idempotency**: The `lead_id` is used as the idempotency key. Retrying the same request
must not trigger duplicate code deliveries on the PanelSmart side.

**Expected responses**:

| HTTP Status | Meaning | Chatbot action |
|-------------|---------|----------------|
| 200 / 202 | Code delivery queued | Set `lead_status = waiting_for_code` |
| 409 | Already requested (idempotent duplicate) | Treat as success |
| 4xx (other) | Client error | Log error, alert, set status to `code_delivered_not_registered` |
| 5xx | Server error | Retry with exponential backoff (500ms → 1s → 2s, max 3 attempts), then escalate |

**Retry policy**: 3 attempts, exponential backoff with ±20% jitter.
Timeout per attempt: 8 seconds (within Vercel's 10s serverless limit).
All attempts must complete within the `after()` / `waitUntil` budget.

**Logging**: Every attempt MUST log: attempt number, HTTP status, latency, lead_id,
response body snippet (first 200 chars). Logged to `LLMCallLog` with `call_type = panelsmart_patch`.

---

## Registration Status Monitoring

The system monitors whether a lead successfully registered in PanelSmart.

**Monitoring approach**: [NEEDS CLARIFICATION from Treinta — two options below]

**Option A — Webhook from PanelSmart**: PanelSmart POSTs to `/api/webhooks/panelsmart`
when registration is confirmed or fails. The chatbot updates `lead_status` accordingly.

**Option B — Polling**: The chatbot polls `GET {PANELSMART_API_URL}/panelists/{lead_id}/status`
every N minutes until registration is confirmed, failed, or 20h elapses.

> **Note**: Option A (webhook) is strongly preferred per Principle III (Simplicity) —
> polling adds continuous load and complexity. The Treinta/PanelSmart team must confirm
> whether they can push status updates.

**If Option A (PanelSmart → Chatbot webhook)**:

```
POST /api/webhooks/panelsmart

{
  "lead_id": "uuid",
  "event": "registration_success" | "registration_failure",
  "panelsmart_user_id": "string",
  "timestamp": "ISO8601"
}
```

Security: Validate shared secret header (`X-PanelSmart-Secret`).
