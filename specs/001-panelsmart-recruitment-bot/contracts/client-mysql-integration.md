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

## 2. Registration code lookup (read) — SUPERSEDED by §2b

> **Implemented 2026-07-22, replaced 2026-07-27** — this MySQL-poll approach is no
> longer used. TDM is instead providing a request/webhook contract: see §2b below. Kept
> here for history — `fetchRegistrationCode` (`tdm-mysql/registration-code.ts`) and the
> old `trigger_code` job action have been removed from the codebase.

**Was called by**: Chatbot after the user confirms they downloaded the app (primary path,
never actually built — polling was used instead, see below).

**Was querying**: Read the panelist ID / registration code column(s) for the synced lead row.

**Old expected outcomes**:

| Result | Chatbot action |
|--------|----------------|
| Code present | Send code to user; set `lead_status = waiting_for_code`; store `panelistCode` locally |
| Code not yet written | Short retry/backoff; optional “estamos generando tu código”; then re-query |
| Sync never succeeded / permanent miss | Log (`call_type = client_mysql_code_lookup`); handoff / `code_delivered_not_registered` |

---

## 2b. Registration code request + webhook (current, replaces §2)

> **Implemented 2026-07-27, real endpoint + auth confirmed 2026-07-27.** Instead of the
> bot reading TDM's MySQL, the bot now POSTs a JSON request to TDM's `/api/ai-lead`
> endpoint, and TDM calls back a bot-hosted webhook with the code (or a failure). The
> mock path (`REGISTRATION_CODE_MOCK_ENABLED=true`) remains available for local testing
> without hitting TDM's dev environment.

**Trigger**: `phase-2.ts` schedules the `request_registration_code` job
`PHASE2_CODE_DELAY_SECONDS` after `link_sent`
([re-engage/route.ts](../../../src/app/api/jobs/re-engage/route.ts)).

**Auth (outbound)** — TDM's endpoint sits behind Azure AD (Microsoft Entra ID); we must
obtain a bearer token via the OAuth2 **client_credentials** grant before every request
(cached in-memory and refreshed before expiry — `src/lib/tdm-registration/oauth.ts`):

```bash
curl --request POST \
  "https://login.microsoftonline.com/<tenant-id>/oauth2/v2.0/token" \
  --header "Content-Type: application/x-www-form-urlencoded" \
  --data-urlencode "client_id=<client_id>" \
  --data-urlencode "client_secret=<client_secret>" \
  --data-urlencode "scope=api://<tdm-app-id>/.default" \
  --data-urlencode "grant_type=client_credentials"
```

**Outbound request** — `POST TDM_REGISTRATION_REQUEST_URL` (TDM's dev endpoint:
`https://kantar-sendleads-fxapp-useast-dev-*.eastus-01.azurewebsites.net/api/ai-lead`),
header `Authorization: Bearer <access_token>`, built by `buildRegistrationCodeRequest`
(`src/lib/tdm-registration/build-request.ts`):

```json
{
  "lead_id": "uuid-interno-del-bot",
  "canal": "WhatsApp | Telegram | Web",
  "pais_codigo": "GT",
  "pais_residencia": "Guatemala",
  "nombre_completo": "Juan Pérez",
  "telefono": "+50255551234",
  "correo_electronico": "juan@example.com",
  "region": "Centro II",
  "departamento_provincia": "Guatemala",
  "municipio_canton": "Mixco",
  "barrio_parroquia": "Zona 10",
  "metodo_contacto_preferido": "WhatsApp",
  "horario_contacto_preferido": "Noche (18-21hs)",
  "fecha_nacimiento": null
}
```
`canal` is Title Case (`src/lib/tdm-registration/canal.ts`) — confirmed by TDM's example
for `WhatsApp`; `Telegram`/`Web` follow the same convention but aren't independently
confirmed. `pais_codigo` covers only the bot's 7 active countries (GT/HN/SV/NI/CR/DO/PA —
no México). `fecha_nacimiento` is always `null`: DOB isn't collected until Ficha Hogar,
after registration (TDM's own example shows a real date, but that's illustrative — we
genuinely don't have DOB at this point in the flow).

**Test mode**: TDM has no sandbox environment, so while `TDM_TEST_MODE_ENABLED=true`,
every outbound request overrides `telefono`/`correo_electronico` to fixed values
(`+50255551234` / `test@example.com`, `src/lib/tdm-registration/test-mode.ts`) so TDM can
identify and discard test records among real ones. Everything else in the payload stays
real. **Turn this off before real launch.**

**Inbound webhook** — `POST /api/webhooks/tdm-registration-code`
([route.ts](../../../src/app/api/webhooks/tdm-registration-code/route.ts)), auth header
`X-TDM-Registration-Secret` against `TDM_REGISTRATION_WEBHOOK_SECRET`. Confirmed 2026-07-27
to be minimal — no `event`/failure signal, TDM only calls this on success:

```json
{
  "lead_id": "uuid-interno-del-bot",
  "panelist_id": 22222
}
```
`panelist_id` is stored as `leads.tdmRegistrationCode` (stringified) and sent to the user
as their registration code.

**Expected outcomes**:

| Result | Chatbot action |
|--------|----------------|
| Valid call (lead still `link_sent`) | `deliverRegistrationCode()` — transition to `waiting_for_code`, send code + confirm buttons, arm 20h freeze |
| Lead already past `link_sent` (TDM retry) | No-op, `200 already_processed` |
| Webhook never arrives within `TDM_REGISTRATION_CODE_TIMEOUT_SECONDS` | `registration_code_timeout` job → `abandono` — this is also the **only** failure path, since TDM's payload has no failure signal |

**Idempotency**: guaranteed by checking `leadStatus === 'link_sent'` before acting — a
retried webhook call after the code was already delivered is a safe no-op, returned as
`200` (not an error) so TDM's retry logic stops.

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

**§2b registration-code request+webhook:**

| Variable | Required | Description |
|----------|----------|-------------|
| `TDM_REGISTRATION_REQUEST_URL` | for real (non-mock) flow | TDM's `/api/ai-lead` endpoint we POST the request JSON to |
| `TDM_OAUTH_TOKEN_URL` | for real flow | Azure AD token endpoint for TDM's tenant (`https://login.microsoftonline.com/<tenant-id>/oauth2/v2.0/token`) |
| `TDM_OAUTH_CLIENT_ID` | for real flow | TDM-provided Azure AD app client ID |
| `TDM_OAUTH_CLIENT_SECRET` | for real flow | TDM-provided Azure AD app client secret |
| `TDM_OAUTH_SCOPE` | for real flow | `api://<tdm-app-id>/.default` |
| `TDM_REGISTRATION_CODE_TIMEOUT_SECONDS` | no (default 1800) | How long we wait for TDM's webhook before `abandono` |
| `TDM_REGISTRATION_WEBHOOK_SECRET` | no (dev default set) | Ours — auth secret for the inbound webhook |
| `REGISTRATION_CODE_MOCK_ENABLED` | no (default false) | Bypasses TDM entirely, delivers a mock code — the only way to test this locally today |
| `TDM_TEST_MODE_ENABLED` | no (default false) | Overrides telefono/correo_electronico with fixed test values on every real outbound request — TDM has no sandbox, so this is how they tell test records apart. Turn off before real launch |

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
