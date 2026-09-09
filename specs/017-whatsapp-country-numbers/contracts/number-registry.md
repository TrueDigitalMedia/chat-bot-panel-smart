# Contract: WhatsApp Number Registry

Module: `src/lib/whatsapp/number-registry.ts`. The single switch point mapping a Meta
`phone_number_id` to a recruitment country (Principle V). Backed by env, parsed once.

## Config

`WHATSAPP_NUMBER_MAP` — JSON object, optional. Keys are Meta `phone_number_id` strings; values are
canonical `CountryConfig` country names.

```
WHATSAPP_NUMBER_MAP={"109876...EC":"Ecuador","550123...MX":"México"}
```

`env.ts`: `WHATSAPP_NUMBER_MAP: z.string().optional()` (raw string; parsed by the registry, not zod).

## API

### `countryForPhoneNumberId(id: string | null | undefined): string | null`

| Input | Output |
|---|---|
| an id present in the map with a supported country | that country name (e.g. `'Ecuador'`) |
| an id absent from the map | `null` (generic — ask the country question) |
| `env.WHATSAPP_PHONE_NUMBER_ID` (the CAM default), assuming not in the map | `null` |
| `null` / `undefined` / `''` | `null` |
| an id in the map whose value is not a supported/configured country | `null` + one-time `console.warn('whatsapp_number_map_bad_country', { id, value })` at parse |

Pure, synchronous, no I/O. Never throws.

### `listWhatsAppNumbers(): WhatsAppNumberInfo[]`

```ts
interface WhatsAppNumberInfo {
  phoneNumberId: string
  country: string | null   // null = generic ("pregunta país")
  isDefault: boolean       // true for env.WHATSAPP_PHONE_NUMBER_ID
}
```

Returns every mapped id plus the default CAM id (deduped). Order: default first, then map insertion
order. Powers the admin page; the admin page separately attempts a best-effort Meta fetch for the
messaging tier (not part of this contract).

### `defaultPhoneNumberId(): string | undefined`

Returns `env.WHATSAPP_PHONE_NUMBER_ID`. Used as the outbound fallback when a lead has no bound
number.

## Parsing rules

| Situation | Behavior |
|---|---|
| env unset / `''` | empty registry; every number generic; `console.info('whatsapp_number_map_empty')` once |
| invalid JSON | empty registry; `console.error('whatsapp_number_map_invalid_json')` once; **do not throw** (must not break boot) |
| value not a string / not `isSupportedCountry` | that entry dropped + warn; rest of the map still loads |
| duplicate country across two ids | allowed (two numbers, same country) — both map to that country |
| an id also equal to the default CAM id | the map wins (explicit mapping overrides "default = generic") |

## Invariants

- No other module reads `WHATSAPP_NUMBER_MAP` or branches on a `phone_number_id` literal.
- Changing the map is config-only — no code change, no migration, no redeploy of schema (FR-014,
  SC-008). A process restart / redeploy picks up the new value.
- Registry never performs network or DB I/O.
