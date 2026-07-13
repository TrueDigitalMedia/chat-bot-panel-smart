# Contract: Lead State API

Internal API for querying and managing lead state. Used by background jobs and the
re-engagement scheduler.

---

## GET /api/leads/[id]

Retrieve current lead status and flow position.

**Path params**: `id` — Lead UUID

**Response (200 OK)**:
```json
{
  "id": "uuid",
  "phone_number": "+521234567890",
  "lead_status": "link_sent",
  "current_phase": 2,
  "last_pending_question": "app_download_confirmed",
  "score": 72,
  "quota_segment": "C+",
  "last_activity_at": "2026-07-07T15:30:00Z"
}
```

**Response (404)**: Lead not found.

---

## PATCH /api/leads/[id]/status

Transition a lead's status. Validates the transition against the allowed-transitions map
before writing. Used by background jobs (e.g., registration monitor, inactivity freeze).

**Path params**: `id` — Lead UUID

**Request body**:
```json
{
  "new_status": "code_delivered_not_registered",
  "reason": "panelsmart_registration_error",
  "metadata": {}
}
```

**Allowed transitions** (enforced server-side):
```
incomplete             → link_sent | not_qualified | quota_exhausted
link_sent              → waiting_for_code
waiting_for_code       → code_delivered_registered | code_delivered_not_registered | code_delivered_no_response
code_delivered_registered → ficha_hogar_completada | not_qualified
any non-terminal       → abandono
```

**Response (200 OK)**:
```json
{ "id": "uuid", "previous_status": "link_sent", "new_status": "waiting_for_code" }
```

**Response (409 Conflict)**:
```json
{ "error": "invalid_transition", "from": "not_qualified", "to": "link_sent" }
```

---

## POST /api/jobs/re-engage

QStash delivers re-engagement jobs to this endpoint. Sends the appropriate outbound
Telegram message and increments the attempt counter.

**Security**: Validates `Upstash-Signature` header before processing.

**Request body** (posted by QStash):
```json
{
  "lead_id": "uuid",
  "phase": 2,
  "attempt_number": 1,
  "template_name": "panelsmart_reengagement_1"
}
```

**Processing**:
1. Validate Upstash signature.
2. Check if lead is still inactive (no newer `last_activity_at`). If active, abort (no-op).
3. If `attempt_number` < 3: send template, increment `re_engagement_count`, schedule next.
4. If `attempt_number` == 3: send final template, set `lead_status = abandono`.

**Response (200 OK)**:
```json
{ "outcome": "sent" | "skipped_already_active" | "marked_abandono" }
```
