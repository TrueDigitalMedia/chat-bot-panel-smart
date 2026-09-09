# WhatsApp per-country numbers (spec 017)

Ecuador and Mexico each have a dedicated WhatsApp business number, distinct from the shared
CAM number. All numbers live under **one shared account** — a Meta WABA, or a Twilio project,
depending on `WHATSAPP_PROVIDER`. Both providers are supported.

## Provider — how a number is identified

| | Meta (`WHATSAPP_PROVIDER=meta`) | Twilio (`WHATSAPP_PROVIDER=twilio`) |
|---|---|---|
| Sender id (map key, `leads.whatsapp_phone_number_id`) | `phone_number_id` | business number in **E.164** (`+593…`) |
| Inbound: how we learn it | `entry[].changes[].value.metadata.phone_number_id` | webhook form field `To` (`whatsapp:+E164`, stripped) |
| Outbound: how it's selected | `graph.facebook.com/<version>/<phone_number_id>/messages` | Twilio `messages.create({ from: 'whatsapp:+E164' })` |
| Shared default sender | `WHATSAPP_PHONE_NUMBER_ID` | `TWILIO_WHATSAPP_FROM` |
| Messaging-tier column in admin | Graph `messaging_limit_tier` / `quality_rating` | not exposed → "no disponible" |

Everything else (country scoping, acquisition source, no-re-scope guarantee, outbound
fallback + logging) is identical across providers.

## What is shared vs. per-number

| Shared (one value for all numbers) | Per-number |
|---|---|
| API credentials (`WHATSAPP_ACCESS_TOKEN` / `TWILIO_ACCOUNT_SID`+`TWILIO_AUTH_TOKEN`) | sender id (`phone_number_id` or E.164) |
| webhook signature secret (`WHATSAPP_APP_SECRET` / Twilio auth token) | local display number |
| verify token / webhook subscription (`/api/webhooks/whatsapp`) | messaging limit / quality rating (Meta only; ramp-up is per number) |
| approved message-template inventory (`whatsapp_templates`) | which recruitment country it is scoped to |

The account is shared, so one approved template set serves every number and there is **no
per-number credential or per-country template row**.

## Configuration — `WHATSAPP_NUMBER_MAP`

JSON map of sender-id → country, parsed by `src/lib/whatsapp/number-registry.ts`. The key
is a `phone_number_id` (Meta) or an E.164 number (Twilio) — see the table above.

```
# Meta
WHATSAPP_NUMBER_MAP={"<phone_number_id_EC>":"Ecuador","<phone_number_id_MX>":"México"}
# Twilio
WHATSAPP_NUMBER_MAP={"+593999999999":"Ecuador","+521999999999":"México"}
```

- A sender id **not** in the map (including the shared default — `WHATSAPP_PHONE_NUMBER_ID`
  for Meta, `TWILIO_WHATSAPP_FROM` for Twilio) is the *generic* number: it still asks
  "¿En qué país te encuentras?".
- Country values are validated against the `CountryConfig` registry. An unknown or
  not-yet-configured country is dropped with a `whatsapp_number_map_bad_country` warning and
  that id behaves as generic.
- Invalid JSON / unset ⇒ empty registry ⇒ every number generic (identical to pre-017).

`number-registry.ts` is the **only** place a WhatsApp number is switched on a country
(constitution Principle V) — the analogue of feature 016's `src/lib/web/chat-rooms.ts`.

## Behavior

**Inbound** — the webhook derives the sender id (Meta: `value.metadata.phone_number_id`;
Twilio: form field `To`) and:
- binds the lead to that number at creation (`leads.whatsapp_phone_number_id`, set once,
  never re-bound);
- for a brand-new conversation on a country-scoped number, pre-sets
  `survey_profiles.country` + `leads.acquisition_source = 'whatsapp:number:<country>'`, so
  the existing survey skip logic (feature 016) never asks the country question and geo is
  entered manually;
- an existing lead is never re-scoped (a later message on a different number just logs
  `whatsapp_inbound_number_mismatch`).

**Outbound** — every send (live replies and background jobs: re-engage, code / link
delivery, freeze/timeout) goes from `lead.whatsapp_phone_number_id`, threaded through
`messaging/send.ts` → `whatsapp/send.ts` → the active provider
(`graphMessagesUrl(phoneNumberId)` for Meta, `messages.create({ from })` for Twilio).
No bound number ⇒ falls back to the shared default and logs `whatsapp_from_fallback`.
There is **no** automatic failover to another number (both providers require replying on
the same number the customer used).

## Adding a number later

1. Provision + verify the number: Meta Business Manager (register on the shared WABA,
   approve the display name), or the Twilio console (add a WhatsApp sender to the project).
2. Add `"<sender_id>":"<Country>"` to `WHATSAPP_NUMBER_MAP` and redeploy — `sender_id` is
   the `phone_number_id` (Meta) or the E.164 number (Twilio).
3. Nothing else — no code change, no migration. Confirm on `/admin/whatsapp-numbers`.

## Ramp-up

Messaging limits and quality rating are **per number**. Meta exposes the tier
(1K → 10K → 100K → unlimited) on `/admin/whatsapp-numbers`; Twilio does not expose an
equivalent to the app. Run the phased ramp-up for each new number independently either way.

## Observability

`whatsapp_inbound_number` (per message: `phone_number_id` = sender id, `display_phone_number`,
`resolved_country`, `outcome` ∈ `scoped|generic|unknown_number`, `provider`),
`whatsapp_number_scope_applied` (brand-new scoped lead), `whatsapp_inbound_number_mismatch`,
`whatsapp_from_fallback`, and a `from` / `phone_number_id` field on every
`[whatsapp:*:out]` log.
