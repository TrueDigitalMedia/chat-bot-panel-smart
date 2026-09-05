# Quickstart / Validation: WhatsApp Country Numbers

Validates spec 017. Assumes features 014 / 015 / 016 merged on `feature/ecuador-mexico`.

## Prerequisites

- `.env` with `WHATSAPP_PROVIDER=meta`, `WHATSAPP_PHONE_NUMBER_ID` (CAM default), token, secret,
  verify token — as today.
- `WHATSAPP_NUMBER_MAP={"TEST_EC_ID":"Ecuador","TEST_MX_ID":"México"}` (use throwaway ids in dev).
- Neon dev DB with migration `0031_whatsapp_country_numbers.sql` applied.
- `npx next dev -p 3000` (Playwright expects 3000).

## Scenario 1 — Ecuador number scopes the lead, country question skipped (US1)

1. POST a Meta webhook payload to `/api/webhooks/whatsapp` with
   `entry[].changes[].value.metadata.phone_number_id = "TEST_EC_ID"` and a text message from a fresh
   number. Signature computed with the shared `WHATSAPP_APP_SECRET`.
2. Expect `200 { status: 'received' }`.
3. In the DB: the new lead has `whatsapp_phone_number_id = 'TEST_EC_ID'`,
   `acquisition_source = 'whatsapp:number:Ecuador'`, and `survey_profiles.country = 'Ecuador'`.
4. Continue the conversation (post follow-up inbound payloads). Confirm the bot **never** sends
   "¿En qué país te encuentras?" and the first geo question uses Ecuador wording ("provincia").
5. Logs show `whatsapp_inbound_number { outcome: 'scoped', resolved_country: 'Ecuador' }` and
   `whatsapp_number_scope_applied`.

Repeat with `TEST_MX_ID` → `country = 'México'`, geo wording "estado".

## Scenario 2 — CAM (shared) number unchanged (US1 / FR-015)

1. POST a payload with `phone_number_id` = the CAM `WHATSAPP_PHONE_NUMBER_ID` (or omit `metadata`).
2. New lead has `whatsapp_phone_number_id` = CAM id (or `NULL` if omitted),
   `acquisition_source = NULL`, `survey_profiles.country = NULL`.
3. The survey reaches the country step and asks "¿En qué país te encuentras?" with every supported
   country offered — identical to `main`.
4. Log: `whatsapp_inbound_number { outcome: 'generic' }`.

## Scenario 3 — every outbound goes from the bound number, incl. background jobs (US2 / SC-003)

1. For the Scenario-1 Ecuador lead, drive the flow to `link_sent` and trigger
   `deliver-registration-code`. Capture outbound `graphSend` calls (regression harness or a
   `read_network_requests` equivalent).
2. Every send URL contains `/TEST_EC_ID/messages` — the questionnaire replies, the registration-link
   message, and the verification-code template.
3. Fire the `re-engage` QStash callback for that lead. Its nudge also goes to `/TEST_EC_ID/messages`.
4. Do the same for a CAM lead → every send uses the CAM id.

## Scenario 4 — unknown number never errors (FR-008 / SC-009)

1. POST a payload with `phone_number_id = "NOT_IN_MAP_123"`.
2. Expect `200`. Lead is created generic (country asked). Log:
   `whatsapp_inbound_number { outcome: 'generic' }` (id recorded).

## Scenario 5 — existing lead is not re-scoped or re-bound (FR-012 / R4)

1. Create a lead via the CAM number, answer `country = México` on the question.
2. POST a new inbound for the same sender with `phone_number_id = "TEST_EC_ID"`.
3. `survey_profiles.country` stays `México`; `whatsapp_phone_number_id` stays the CAM id;
   `acquisition_source` stays `NULL`. Log: `whatsapp_inbound_number_mismatch`.

## Scenario 6 — legacy lead falls back on outbound (FR-007 / G2)

1. Manually null a WhatsApp lead's `whatsapp_phone_number_id`.
2. Trigger any outbound. It sends from `env.WHATSAPP_PHONE_NUMBER_ID`; log `whatsapp_from_fallback`.

## Scenario 7 — admin numbers page (US4 / SC-007)

1. Log in as admin, open `/admin/whatsapp-numbers` (sidebar "Números WhatsApp").
2. Rows: CAM id ("genérico — pregunta país"), Ecuador id → Ecuador, Mexico id → México. Messaging
   tier column shows a value or "no disponible".
3. `/admin/conversations` source filter offers "WhatsApp: Ecuador" / "WhatsApp: México" and filters
   correctly.

## Scenario 8 — config-only extension (SC-008)

1. Add `"TEST_CO_ID":"Colombia"` to `WHATSAPP_NUMBER_MAP` **only if** Colombia has a `CountryConfig`;
   otherwise expect the entry to be dropped with a `whatsapp_number_map_bad_country` warn and that id
   to behave as generic. No code change either way.

## Regression (SC-005)

```
npm run test:regression                 # CAM Telegram golden-master — must stay green
npm run test:regression:whatsapp        # NEW — CAM WhatsApp byte-identical + per-number URL asserts
npm test -- whatsapp-number-registry whatsapp-inbound-number-attribution whatsapp-outbound-from-number
npx playwright test admin-whatsapp-numbers
```
