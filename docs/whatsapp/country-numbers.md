# WhatsApp per-country numbers (spec 017)

Ecuador and Mexico each have a dedicated WhatsApp business number, distinct from the shared
CAM number. All numbers live under **one shared Meta WhatsApp Business Account (WABA)** and
one Meta app.

## What is shared vs. per-number

| Shared (one value for all numbers) | Per-number |
|---|---|
| `WHATSAPP_ACCESS_TOKEN` | `phone_number_id` (Meta) |
| `WHATSAPP_APP_SECRET` (webhook signature) | local display number |
| `WHATSAPP_VERIFY_TOKEN` | Meta messaging limit / quality rating (ramp-up is per number) |
| webhook subscription (`/api/webhooks/whatsapp`) | which recruitment country it is scoped to |
| approved message-template inventory (`whatsapp_templates`) | |

Because the WABA is shared, one approved template set serves every number and there is **no
per-number credential or per-country template row**.

## Configuration — `WHATSAPP_NUMBER_MAP`

JSON map of `phone_number_id` → country, parsed by `src/lib/whatsapp/number-registry.ts`:

```
WHATSAPP_NUMBER_MAP={"<phone_number_id_EC>":"Ecuador","<phone_number_id_MX>":"México"}
```

- A `phone_number_id` **not** in the map (including `WHATSAPP_PHONE_NUMBER_ID`, the shared
  CAM number) is the *generic* number: it still asks "¿En qué país te encuentras?".
- Country values are validated against the `CountryConfig` registry. An unknown or
  not-yet-configured country is dropped with a `whatsapp_number_map_bad_country` warning and
  that id behaves as generic.
- Invalid JSON / unset ⇒ empty registry ⇒ every number generic (identical to pre-017).

`number-registry.ts` is the **only** place a WhatsApp number is switched on a country
(constitution Principle V) — the analogue of feature 016's `src/lib/web/chat-rooms.ts`.

## Behavior

**Inbound** — the webhook reads `entry[].changes[].value.metadata.phone_number_id` and:
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
`messaging/send.ts` → `whatsapp/send.ts` → `providers/meta/send.ts` →
`graphMessagesUrl(phoneNumberId)`. No bound number ⇒ falls back to
`WHATSAPP_PHONE_NUMBER_ID` and logs `whatsapp_from_fallback`. There is **no** automatic
failover to another number (Meta requires replying on the same number the customer used).

## Adding a number later

1. Provision + verify the number in Meta Business Manager, register it on the shared WABA,
   get its display name approved.
2. Add `"<new_phone_number_id>":"<Country>"` to `WHATSAPP_NUMBER_MAP` and redeploy.
3. Nothing else — no code change, no migration. Confirm on `/admin/whatsapp-numbers`.

## Ramp-up

Meta messaging limits (1K → 10K → 100K → unlimited) and the quality rating are **per
number**. Run the phased ramp-up for each new number independently; the current tier is
shown on `/admin/whatsapp-numbers` when Meta exposes it to the app.

## Observability

`whatsapp_inbound_number` (per message: `phone_number_id`, `display_phone_number`,
`resolved_country`, `outcome` ∈ `scoped|generic|unknown_number`),
`whatsapp_number_scope_applied` (brand-new scoped lead), `whatsapp_inbound_number_mismatch`,
`whatsapp_from_fallback`, and a `phone_number_id` field on every `[whatsapp:meta:out]` log.
