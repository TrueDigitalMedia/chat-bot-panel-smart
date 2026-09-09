# Data Model: WhatsApp Country Numbers

No new tables. One nullable column, one env-config registry, three in-memory type additions.

## 1. `leads.whatsapp_phone_number_id` (NEW column)

| | |
|---|---|
| Type | `varchar(40)`, nullable |
| Meaning | The Meta `phone_number_id` of the business number this lead's WhatsApp conversation is bound to — the number the bot replies from. |
| Set | Once, at lead creation, by `upsertLead('whatsapp', …, { phoneNumberId })` from the inbound `value.metadata.phone_number_id`. |
| Never | Updated after creation (bind once — R4). Not re-bound when the person later messages a different number. Not derived from `survey_profiles.country` (which the lead may correct). |
| Null when | Non-WhatsApp lead; legacy WhatsApp lead created before this feature; inbound payload lacked `metadata` (treated as generic). |
| Read by | `messaging/send.ts` (as `to.whatsappPhoneNumberId`) → outbound provider layer. Null ⇒ fall back to `env.WHATSAPP_PHONE_NUMBER_ID` + log `whatsapp_from_fallback`. |
| Migration | `0031_whatsapp_country_numbers.sql` — `ALTER TABLE "leads" ADD COLUMN "whatsapp_phone_number_id" varchar(40);` (journal idx 15, after 016's `0030`). |

## 2. Number registry (`src/lib/whatsapp/number-registry.ts`) — config, not storage

Backed by env var `WHATSAPP_NUMBER_MAP` (JSON object), parsed once at module load.

```
WHATSAPP_NUMBER_MAP = {"<phone_number_id_EC>":"Ecuador","<phone_number_id_MX>":"México"}
```

| Field | Rule |
|---|---|
| key | a Meta `phone_number_id` string (opaque, environment-specific) |
| value | a canonical `CountryConfig` country name. Validated at parse time against `isSupportedCountry`. Unknown / not-yet-configured country name → entry dropped + `console.warn('whatsapp_number_map_bad_country')`; that id then behaves as generic. |
| absent id | Any `phone_number_id` not in the map routes as **generic / shared** → country question is asked. `env.WHATSAPP_PHONE_NUMBER_ID` (the CAM number) is the canonical generic id and is never required to appear in the map. (Observability only: an absent id that is also not the CAM default is logged with `outcome: 'unknown_number'` rather than `'generic'` — identical conversation behavior; see §7 and `contracts/inbound-number-attribution.md`.) |
| empty / unset / invalid JSON | Registry is empty → every number is generic → behavior identical to today. Logged once. |

**Exports**

- `countryForPhoneNumberId(id: string | null | undefined): string | null` — country name, or `null`
  for generic/unknown/absent.
- `listWhatsAppNumbers(): { phoneNumberId: string; country: string | null; isDefault: boolean }[]` —
  the map entries plus the default CAM id (`country: null`, `isDefault: true`). Powers the admin page.
  It deliberately does **not** carry a display number: `WHATSAPP_NUMBER_MAP` is keyed by
  `phone_number_id` only. The admin page (R6) obtains the local display number from its best-effort
  `GET /{phone_number_id}?fields=display_phone_number,messaging_limit_tier,quality_rating` call and
  falls back to showing `phone_number_id` when that call fails (FR-013 "when available"). If a
  persistent display number is later wanted, add a `WHATSAPP_NUMBER_LABELS` env map rather than
  widening `WHATSAPP_NUMBER_MAP`.
- `defaultPhoneNumberId(): string | undefined` — `env.WHATSAPP_PHONE_NUMBER_ID`.

**Principle V note**: this map is the *single* place a WhatsApp number is switched on a country —
the analogue of feature 016's `chat-rooms.ts`. Nothing else does `if (phoneNumberId === …)` or
`if (country === …)`.

## 3. `ChannelInbound.whatsappPhoneNumberId?: string` (NEW field)

Set by `normalizeMetaInbound` from `value.metadata.phone_number_id`. Undefined for Twilio inbound
and for payloads without `metadata`. Consumed by `handle-inbound.ts` to bind the lead and decide
country pre-set. Not persisted directly (it becomes `leads.whatsapp_phone_number_id`).

## 4. `ChannelRecipient.whatsappPhoneNumberId?: string` + `Lead.whatsappPhoneNumberId: string | null` (NEW fields)

`Lead` mirrors the column. `ChannelRecipient` carries it so `messaging/send.ts` can select the
from-number. Background jobs pass the full `Lead` as the recipient, so they inherit it automatically.
Telegram/web recipients leave it undefined.

## 5. `leads.acquisition_source` value (REUSED column, new values)

| Value | Meaning |
|---|---|
| `whatsapp:number:Ecuador` | Lead's first inbound landed on the Ecuador-scoped number. |
| `whatsapp:number:México` | Lead's first inbound landed on the Mexico-scoped number. |
| `null` (WhatsApp lead) | Generic / shared number — country asked. |

Max length 22 → fits `varchar(40)`. Set once, at creation, alongside `survey_profiles.country`.
Preserved even if the person later corrects their country (provenance, matching feature 016).
`SOURCE_FILTERS` / `roomLabel` in `/admin/conversations` and the `acquisitionSource` filter in
`conversation-messages.ts` gain these two values (and optionally a `whatsapp-generic` option =
`channel='whatsapp' AND acquisition_source IS NULL`, mirroring the existing `'generic'` web option).

## 6. Lead ↔ number binding lifecycle

```
inbound message
  │  extract phone_number_id from value.metadata
  ▼
upsertLead('whatsapp', E164(from), { phoneNumberId })
  │
  ├─ lead was just CREATED:
  │     • leads.whatsapp_phone_number_id = phoneNumberId
  │     • country = countryForPhoneNumberId(phoneNumberId)
  │     • if country != null:
  │           survey_profiles.country = country
  │           leads.acquisition_source = 'whatsapp:number:' + country
  │           log whatsapp_number_scope_applied
  │       else: nothing (generic — country question will be asked)
  │
  └─ lead ALREADY EXISTED:
        • whatsapp_phone_number_id unchanged  (no rebind — R4)
        • survey_profiles.country unchanged   (no re-scope — FR-012)
        • if inbound phone_number_id != stored: log whatsapp_inbound_number_mismatch (informational)
```

State transitions: none new. The country pre-set slots into the same "pre-answered field" path
feature 016 already built; `nextQuestionToSend` skips the `country` question; `needsGpsCapture`
already returns false once `survey_profiles.country` is set.

## 7. Observability events (Principle II)

| Event | When | Fields |
|---|---|---|
| `whatsapp_inbound_number` | every inbound Meta message | `phone_number_id`, `display_phone_number`, `resolved_country` (or null), `outcome` ∈ `scoped` \| `generic` \| `unknown_number` |
| `whatsapp_number_scope_applied` | brand-new lead on a country-scoped number | `lead_id`, `phone_number_id`, `country`, `acquisition_source` |
| `whatsapp_inbound_number_mismatch` | existing lead messages a different number than it is bound to | `lead_id`, `bound_phone_number_id`, `inbound_phone_number_id` |
| `whatsapp_from_fallback` | outbound for a lead with no bound number | `lead_id`, `fell_back_to` (= default CAM id) |
| `[whatsapp:meta:out]` (existing) | every outbound | + new `phone_number_id` field = the number sent from |

## 8. Explicitly NOT changed

- `whatsapp_templates` — no country / WABA / `phone_number_id` dimension (shared WABA → one approval
  set). FR-010.
- `WHATSAPP_APP_SECRET`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_VERIFY_TOKEN` — single shared values.
  FR-009.
- Twilio provider path — untouched.
- Re-engagement schedules, attempt cap, opt-out, 24h-window logic — untouched (FR-016); the job just
  sends from the bound number.
