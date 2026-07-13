# Contract: Telegram location share (GPS gate)

**Feature**: `002-nse-geo-location-quota`  
**Channel**: Telegram (V1)

---

## Outbound: request location

**Messaging port**: `sendLocationRequest(to: ChannelRecipient): Promise<void>`

**Telegram implementation**: `sendMessage` with reply keyboard:

```json
{
  "keyboard": [
    [{ "text": "📍 Compartir ubicación", "request_location": true }],
    [{ "text": "Escribir mi ubicación" }]
  ],
  "resize_keyboard": true,
  "one_time_keyboard": true
}
```

Prompt text (product copy may be tuned in implement): ask the panelist to share live location or choose to type instead.

- **Compartir ubicación** → Telegram sends `message.location`.
- **Escribir mi ubicación** → treated as cancel/skip → manual geo path (`gpsGateStatus = skipped_manual`).

After handling, remove reply keyboard (same pattern as phone request).

---

## Inbound: location message

Webhook MUST accept updates containing:

```json
{
  "message": {
    "chat": { "id": 123 },
    "location": {
      "latitude": 14.6349,
      "longitude": -90.5069
    }
  }
}
```

**Channel inbound extension** (ephemeral; not persisted):

```ts
{
  kind: 'location',
  latitude: number,
  longitude: number
}
```

Handler: if `gpsGateStatus === awaiting_location`, run reverse geocode → store `gpsProposal` → send confirm UI; else ignore or no-op safely.

**Privacy**: Pass coordinates only to Nominatim for this turn; do not write lat/lng to Postgres.

---

## Outbound: GPS place confirmation

Text listing:

- País: …
- Departamento/Provincia: …
- Municipio/Cantón: …
- Barrio: … | No identificado

Inline keyboard:

| Button | `callback_data` |
|--------|-----------------|
| Sí, es correcto | `gps:yes` |
| No, corregir | `gps:no` |

---

## Callback handling

| Callback | Effect |
|----------|--------|
| `gps:yes` | Allowlist on proposal country/state/municipality; hit → persist profile + `geoSource=gps_share`; miss → EXIT_B; if hit and barrio null → ask neighborhood only |
| `gps:no` | Clear `gpsProposal`; `skipped_manual`; start manual country question |

---

## WhatsApp

Same port method reserved; V1 implementation may throw / no-op until WhatsApp location request exists.
