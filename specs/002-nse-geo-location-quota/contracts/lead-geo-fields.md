# Contract: Lead geo quota fields (monitor / detail API)

**Feature**: `002-nse-geo-location-quota`

Extends conversation detail / lead profile payloads used by `/conversations` and `/conversations/[id]`.

---

## Survey profile geo block (response)

```json
{
  "country": "Guatemala",
  "stateProvince": "Guatemala",
  "municipality": "Mixco",
  "neighborhood": "Zona 4",
  "nseRegion": "Región …",
  "geoSource": "gps_share",
  "inQuotaGeo": true
}
```

| Field | Values | Notes |
|-------|--------|-------|
| `geoSource` | `gps_share` \| `text_exact` \| `text_fuzzy` \| `null` | Set when geo gate completes |
| `nseRegion` | string \| `null` | Catalog label on hit |
| `inQuotaGeo` | `true` \| `false` \| `null` | `false` when EXIT_B from geo allowlist |

---

## List / detail UI requirements

- Detail sidebar **Ubicación**: show existing four fields **plus** NSE region, geo source, in-quota flag.
- List view: optional column or badge not required for V1; detail is mandatory for SC-004.

---

## Lead status on geo miss

When allowlist misses:

```json
{
  "leadStatus": "quota_exhausted"
}
```

Bot sends existing EXIT_B text (see `src/lib/conversation/exit-messages.ts`). No new status enum value.
