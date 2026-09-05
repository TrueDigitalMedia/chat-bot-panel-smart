# Contract: Inbound Number Attribution

How a Meta webhook message is attributed to its business number and how that drives country scoping.

## Payload shape (Meta, received today — `metadata` not yet read)

```jsonc
{
  "entry": [{
    "changes": [{
      "value": {
        "metadata": { "display_phone_number": "593...", "phone_number_id": "1098...EC" },
        "contacts": [ ... ],
        "messages": [ { "from": "5939...", "id": "wamid...", "type": "text", "text": { "body": "hola" } } ]
      }
    }]
  }]
}
```

`phone_number_id` identifies **the business number the person messaged**. It is inside the signed
body — the single shared `WHATSAPP_APP_SECRET` verifies the whole payload regardless of number
(FR-009). One shared webhook subscription receives all of the WABA's numbers.

## Flow

```
handleMetaPost (route.ts)
  verifyMetaSignature(sig, rawBody)          // unchanged — one shared secret
  extractMetaMessages(payload)
    → for each change: read value.metadata.phone_number_id + display_phone_number
    → yield { message, phoneNumberId, displayPhoneNumber }
  for each { message, phoneNumberId }:
    log whatsapp_inbound_number { phone_number_id, display_phone_number,
                                  resolved_country: countryForPhoneNumberId(phoneNumberId),
                                  outcome }
    lead, created = upsertLead('whatsapp', E164(from), { phoneNumberId })
    inbound = normalizeMetaInbound(message, pending)   // sets inbound.whatsappPhoneNumberId
    processWhatsAppInbound(inbound, { messageId, provider: 'meta', phoneNumberId })
```

### `upsertLead('whatsapp', channelUserId, { phoneNumberId })`

- **create**: set `leads.whatsapp_phone_number_id = phoneNumberId`.
- **existing**: leave `whatsapp_phone_number_id` untouched. If `phoneNumberId` differs from the
  stored value, log `whatsapp_inbound_number_mismatch` (informational; no behavior change).

### `processWhatsAppInbound` — country pre-set (before `routeMessage`)

Only when the lead was **just created** AND `countryForPhoneNumberId(phoneNumberId)` is non-null:

1. write `survey_profiles.country = <country>` (upsert the profile row if needed — same as feature
   016's web-room bootstrap)
2. write `leads.acquisition_source = 'whatsapp:number:' + country`
3. log `whatsapp_number_scope_applied { lead_id, phone_number_id, country, acquisition_source }`

Then `routeMessage` runs as normal; `nextQuestionToSend` (feature 016) sees `country` already
answered and never sends the "¿En qué país…?" question; `needsGpsCapture` returns false → manual geo.

For an **existing** lead: steps 1–3 are skipped entirely — no re-scope (FR-012), no rebind.

## Outcome classification (`whatsapp_inbound_number.outcome`)

Three values: `scoped | generic | unknown_number`. `generic` and `unknown_number` behave
identically for the conversation (country question is asked); they differ only so an operator can
tell a recognised shared number from a `phone_number_id` the deployment has never been told about.

| Condition | outcome |
|---|---|
| `phone_number_id` in the map → supported, configured country | `scoped` |
| `phone_number_id` equals the configured default CAM id (`env.WHATSAPP_PHONE_NUMBER_ID`), or the payload carries no `phone_number_id` at all | `generic` |
| `phone_number_id` present in the payload but neither in the map nor equal to the default CAM id | `unknown_number` |
| `phone_number_id` in the map but its country is not configured / not supported | `unknown_number` (the registry already dropped the entry at parse time + warned, so at request time it is simply "not in the map") |

Every outcome — including `unknown_number` — returns `200 { status: 'received' }` (FR-008, SC-009)
and never re-scopes; the `phone_number_id` is always logged.

## Non-goals

- No per-number signature secret / verify token.
- Twilio inbound path unchanged (no `phoneNumberId`; always generic).
- The same person messaging two numbers is still one lead (keyed on `E164(from)`); the reply number
  stays bound to the first number used.
