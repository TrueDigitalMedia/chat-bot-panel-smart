# Contract: Client MySQL Lead Sync & Registration Code Lookup

The chatbot does **not** call CreatePanelist (GPM) or a PanelSmart PATCH to generate
registration codes. Instead it:

1. **Writes** qualified lead data into the **client MySQL** database.
2. Relies on an **internal client process** to create the panelist and store the
   registration code (panelist ID) in that same MySQL database.
3. **Reads** the code from MySQL and sends it to the user after download confirmation.

This document is the integration contract from the chatbot's perspective.

---

## Overview

```text
[Bot: qualify + quota OK]
        │
        ▼
[INSERT/UPSERT lead row in client MySQL] ──► [Internal client process]
        │                                              │
        ▼                                              ▼
[Send download links · link_sent]          [Writes panelistId / código]
        │
        ▼
[User confirms app download]
        │
        ▼
[SELECT código from MySQL] ──► [Send code to user · waiting_for_code]
```

---

## 1. Sync qualified lead (write)

**Called by**: Chatbot immediately when Phase 1 completes with quota available,
before (or at the start of) Phase 2 link delivery.

**Target**: Client-managed MySQL (connection via `CLIENT_MYSQL_*` env vars).

**Auth**: MySQL user/password (or TLS + credentials as provided by TDM/client).

**Semantics**:
- Idempotent upsert keyed by bot `lead_id` (UUID) and/or phone/email as defined by the
  client schema.
- Payload includes survey contact and geo fields needed for panelist creation
  (exact column map: **TBD — schema from TDM/client**).
- On success: set local `clientMysqlSyncStatus = synced` and continue to Phase 2.
- On failure: log (`call_type = client_mysql_sync`), set `failed`, do **not** invent a
  registration code; apply ops policy (support message / hold before links).

**Feature flag**: `CLIENT_MYSQL_SYNC_ENABLED=false` skips the write and keeps local mocks.

---

## 2. Registration code lookup (read)

> **Implemented 2026-07-22** — with polling instead of a user-confirmation trigger (the
> "primary path" below was never built): `phase-2.ts` schedules the first lookup
> `PHASE2_CODE_DELAY_SECONDS` after `link_sent`; the `trigger_code` job handler
> ([re-engage/route.ts](../../../src/app/api/jobs/re-engage/route.ts)) re-polls every
> `REGISTRATION_CODE_POLL_DELAY_SECONDS` up to `MAX_REGISTRATION_CODE_POLL_ATTEMPTS`
> (`scheduler/constants.ts`) before giving up (→ `abandono`, since no code was ever
> delivered — `code_delivered_not_registered` doesn't apply, see transitions.ts). No mock
> fallback when `CLIENT_MYSQL_SYNC_ENABLED=false` (deliberate — confirmed tradeoff).

**Called by**: Chatbot after the user confirms they downloaded the app (primary path).

**Query**: Read the panelist ID / registration code column(s) for the synced lead row.

**Expected outcomes**:

| Result | Chatbot action |
|--------|----------------|
| Code present | Send code to user; set `lead_status = waiting_for_code`; store `panelistCode` locally |
| Code not yet written | Short retry/backoff; optional “estamos generando tu código”; then re-query |
| Sync never succeeded / permanent miss | Log (`call_type = client_mysql_code_lookup`); handoff / `code_delivered_not_registered` |

**Idempotency**: Re-sending the same code to the same chat after a retry MUST be safe
(user may tap confirm more than once). Prefer reading the already-stored local
`panelistCode` if present.

---

## 3. Registration outcome monitoring

After the code is delivered, the bot still needs a registration outcome signal:

**Option A — User confirmation (current local path)**: Inline buttons
(“Ya me registré” / “No pude registrarme”) → `code_delivered_registered` /
`code_delivered_not_registered`.

**Option B — Client webhook** (if later provided): POST to a bot webhook with
`registration_success` | `registration_failure`.

**Option C — Poll MySQL status column** (if the client exposes one): periodic read until
success, failure, or 20h freeze.

> Default for v1: **Option A** (user confirmation), already implemented in mock form.
> Options B/C require schema or webhook docs from TDM/client.

---

## 4. Environment variables

| Variable | Required when sync enabled | Description |
|----------|---------------------------|-------------|
| `CLIENT_MYSQL_HOST` | yes | MySQL host |
| `CLIENT_MYSQL_PORT` | no (default 3306) | Port |
| `CLIENT_MYSQL_USER` | yes | User |
| `CLIENT_MYSQL_PASSWORD` | yes | Password |
| `CLIENT_MYSQL_DATABASE` | yes | Database name |
| `CLIENT_MYSQL_SYNC_ENABLED` | no (default false) | Feature flag |
| `CLIENT_MYSQL_LEADS_TABLE` | no | Table name override when schema known |
| `CLIENT_MYSQL_CODE_COLUMN` | no | Column name for panelist/registration code |

---

## 5. Logging

Every MySQL sync and code lookup MUST log via `logCall` / `system_call_logs`:
`call_type`, latency, lead_id, correlation_id, success/error (no PII values in logs).

---

## 6. Out of scope

- Implementing the client's internal process that creates the panelist/code.
- CreatePanelist AES / GPM / QMob HTTP APIs.
- PanelSmart `PATCH .../registration-code`.
- Defining the final MySQL DDL (owned by TDM/client; bot maps to it once delivered).
