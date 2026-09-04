# Contract: Ecuador NSE Geo Catalog

**Module**: `src/lib/geo/ecuador-nse-catalog.ts` · **Data**: `data/geo/ecuador-nse-regions.json` ·
**Source**: `docs/ecuador/Muestra Regiones NSE Ecuador.xlsx` (catalog sheet, INEC clasificación 2022)

## Function

```ts
export function lookupEcuadorNseRegion(
  stateProvince: string | null,   // Provincia
  municipality: string | null,    // Cantón
  neighborhood: string | null,    // Parroquia or Parroquia Urbana
): string | null                  // Ecuador Región, or null = out of geographic quota
```

## Data file shape

```json
{
  "version": "docs/ecuador/Muestra Regiones NSE Ecuador.xlsx",
  "source": "INEC clasificación 2022",
  "regions": [
    { "region": "Guayaquil Norte", "provincia": "GUAYAS", "canton": "GUAYAQUIL",
      "parroquia": "GUAYAQUIL", "parroquiaUrbana": "TARQUI" }
  ]
}
```

## Resolution algorithm

1. Normalize every input and catalog value with `normalizeGeoKey` (reuse from `cam-nse-catalog.ts`:
   NFD strip accents, lowercase, non-alphanumeric → space, collapse).
2. **Guayaquil & Quito** (cantón normalizes to `guayaquil` or `distrito metropolitano de quito`):
   match on `provincia | canton | parroquiaUrbana`, using `neighborhood` as the parroquia-urbana.
   These cantones fan out into Norte / Sur / Zona Periferia sub-regions that only the parroquia urbana
   distinguishes.
3. **Everywhere else**: match on `provincia | canton | parroquia`, using `neighborhood` as the
   parroquia; if `neighborhood` is null, fall back to `provincia | canton` when that pair maps to a
   single region (most provincial cantones are wholly inside one region).
4. No match → return `null`. Caller sets `in_quota_geo = false`, `nse_region = null`; the lead only
   proceeds to registration via the pregnancy/baby exception in `checkQuotaAvailability`.
5. Ambiguous parroquia name across cantones (e.g. "Bolívar", "Sucre") is disambiguated by the
   provincia + cantón already captured — never match on parroquia alone.

## Región set

`Costa Norte`, `Costa Sur`, `Sierra`, `Cuenca`, `Santo Domingo`, `Manta–Portoviejo`,
`Guayaquil Norte`, `Guayaquil Sur`, `Quito Norte`, `Quito Sur`, `Zona Periferia/Valles`,
`Zona Periferia GYE`.

## Survey wiring

- `geoHierarchy` = `{ stateProvinceLabel: "provincia", municipalityLabel: "cantón",
  neighborhoodLabel: "parroquia" }` → survey Q3 "¿En qué provincia vives?", Q4 "¿En qué cantón
  vives?", Q5 "¿En qué parroquia vives?" (Q5 shown, unlike CAM).
- GPS path: `reverse-geocode.ts` output → `canonicalCountry` must map "Ecuador"/"EC" → `"Ecuador"`;
  `gps-capture.ts` calls `getCountryConfig("Ecuador").resolveNseRegion(...)` instead of the direct
  `lookupNseRegion` import.

## Test vectors (`tests/unit/ecuador-nse-catalog.test.ts`)

| Provincia | Cantón | Parroquia (urbana) | Expected |
|-----------|--------|--------------------|----------|
| Guayas | Guayaquil | Tarqui | Guayaquil Norte |
| Guayas | Guayaquil | Ximena | Guayaquil Sur |
| Pichincha | Distrito Metropolitano de Quito | Solanda | Quito Sur |
| Pichincha | Distrito Metropolitano de Quito | Iñaquito | Quito Norte |
| Azuay | Cuenca | Cuenca | Cuenca |
| Manabí | Manta | Manta | Manta–Portoviejo |
| Santo Domingo de los Tsáchilas | Santo Domingo | — | Santo Domingo |
| Loja | Loja | Loja | `null` (not in sample) |

## Phone

`getCountryConfig("Ecuador").validatePhone`: strip non-digits; drop leading `593` or a single leading
`0`; require exactly 10 digits (3 area + 7 local); `normalized` = the 10-digit string.
