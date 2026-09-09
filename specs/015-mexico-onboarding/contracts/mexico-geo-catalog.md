# Contract: Mexico NSE Geo Catalog

**Module**: `src/lib/geo/mexico-nse-catalog.ts` · **Data**: `data/geo/mexico-nse-regions.json` ·
**Source**: `docs/mexico/Muestra Regiones NSE Mexico.xlsx` (catalog sheet)

## Function

```ts
export function lookupMexicoNseRegion(
  stateProvince: string | null,   // Estado
  municipality: string | null,    // Municipio / Alcaldía
): string | null                  // Kantar region, or null = out of geographic quota
```

## Data file shape

```json
{
  "version": "docs/mexico/Muestra Regiones NSE Mexico.xlsx",
  "source": "Kantar región / INEGI estado-municipio",
  "regions": [
    { "region": "AMCM", "regionCode": "5", "estrato": "1",
      "estado": "Distrito Federal", "municipio": "IZTAPALAPA" }
  ]
}
```

## Resolution algorithm

1. Normalize inputs and catalog values with `normalizeGeoKey` (reuse from `cam-nse-catalog.ts`).
2. Match on `estado | municipio`.
3. `estrato` / `regionCode` on the matched row are returned as metadata for logging/sync but the
   **quota decision uses only `region`** (research R3).
4. No match → `null`. Caller sets `in_quota_geo = false`, `nse_region = null`; the lead only proceeds
   to registration via the pregnancy/baby exception in `checkQuotaAvailability`.
5. Municipio name collisions across estados (e.g. "Centro" in Tabasco vs. others) are disambiguated by
   the estado already captured — never match on municipio alone.
6. **CP fallback**: if `municipality` is null/unresolved but a valid 5-digit Código Postal was
   captured, ask the municipio question once more; if still unresolved → `null` (out of geo quota).
   A CP→municipio dataset is not in `docs/mexico/`; adding one is a later change.

## Survey wiring

- `geoHierarchy` = `{ stateProvinceLabel: "estado", municipalityLabel: "municipio o alcaldía",
  neighborhoodLabel: "colonia" }` → Q3 "¿En qué estado vives?", Q4 "¿En qué municipio o alcaldía
  vives?", Q5 "¿En qué colonia vives?" (shown). A Mexico-only `codigoPostal` free-text step follows in
  the NSE block ("¿Cuál es tu código postal?", 5 digits).
- GPS path: `canonicalCountry` maps `méxico` / `mexico` / `mx` → `"México"`; `gps-capture.ts` calls
  `getCountryConfig("México").resolveNseRegion(...)`.

## Test vectors (`tests/unit/mexico-nse-catalog.test.ts`)

| Estado | Municipio | Expected |
|--------|-----------|----------|
| Distrito Federal | Iztapalapa | AMCM |
| México | Ecatepec de Morelos | AMCM |
| Hidalgo | Tula de Allende | Centro |
| Veracruz de Ignacio de la Llave | Las Choapas | Centro |
| Yucatán | Mérida | Sureste |
| Jalisco | Guadalajara | (region per catalog — e.g. Occidente) |
| Nuevo León | Monterrey | `null` if absent from the sample |

## Phone

`getCountryConfig("México").validatePhone`: strip non-digits; drop a leading `52`, a `1` immediately
after a stripped `52`, or a single leading `0`; require exactly 10 digits; `normalized` = the 10-digit
string.
