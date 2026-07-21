# Data Model: Cuotas flexibles por dimensión

## `quota_targets` (modificada)

Reemplaza `nse_level` por `dimension_type` + `dimension_value`. Migración: las filas existentes se reescriben con `dimension_type = 'nse'`, `dimension_value = nse_level`.

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | sin cambios |
| `country` | varchar(50) | sin cambios — validado contra `listCatalogCountries()` |
| `region` | varchar(100) | sin cambios — validado contra `listNseRegionsForCountry(country)` |
| `dimension_type` | varchar(20) | **nuevo** — enum de aplicación: `'nse' \| 'edad' \| 'integrantes'` |
| `dimension_value` | varchar(20) | **renombra** `nse_level` — valor válido según `dimension_type` (ver tabla de catálogos abajo) |
| `target_count` | integer | sin cambios |
| `active` | boolean | sin cambios — desactivar una celda individual sigue siendo posible |
| `notes` | text | sin cambios |
| `created_at`, `updated_at` | timestamptz | sin cambios |

**Unique index**: `(country, region, dimension_type, dimension_value)` (reemplaza `quota_targets_country_region_nse_idx`).

**Catálogos de `dimension_value` por `dimension_type`**:

| `dimension_type` | Valores válidos |
|---|---|
| `nse` | `Nivel 1`, `Nivel 2`, `Nivel 3`, `Nivel 4` (mismos que hoy — ver research.md R6) |
| `edad` | `Hasta 34`, `35 a 49`, `50+` |
| `integrantes` | `1 a 2`, `3 a 4`, `5+` |

## `quota_region_caps` (nueva tabla)

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `country` | varchar(50) | validado igual que en `quota_targets` |
| `region` | varchar(100) | validado igual que en `quota_targets` |
| `cap_count` | integer, nullable | `NULL` = sin tope (no bloquea por saturación) |
| `notes` | text, nullable | |
| `created_at`, `updated_at` | timestamptz | |

**Unique index**: `(country, region)`.

## `leads` (columnas nuevas)

| Columna | Tipo | Notas |
|---|---|---|
| `quota_matched_dimension` | varchar(20), nullable | `'nse' \| 'edad' \| 'integrantes' \| 'exception'` — qué condición calificó al lead. `NULL` si nunca pasó el chequeo de cupo (p. ej. `not_qualified`, `incomplete`). |
| `quota_matched_value` | varchar(20), nullable | el valor concreto usado (p. ej. `'Nivel 4'`, `'5+'`). `NULL` cuando `quota_matched_dimension = 'exception'` (no aplica un valor de dimensión). |

`leads.quota_segment` (existente) no cambia de significado — sigue siendo el NSE real del lead (FR-008), independientemente de si fue la dimensión que lo calificó.

## Migración SQL (resumen — ver `src/lib/db/migrations/0014_flexible_quota_matching.sql`)

```sql
ALTER TABLE quota_targets RENAME COLUMN nse_level TO dimension_value;
ALTER TABLE quota_targets ADD COLUMN dimension_type VARCHAR(20) NOT NULL DEFAULT 'nse';
ALTER TABLE quota_targets ALTER COLUMN dimension_type DROP DEFAULT;
DROP INDEX quota_targets_country_region_nse_idx;
CREATE UNIQUE INDEX quota_targets_country_region_dim_idx
  ON quota_targets (country, region, dimension_type, dimension_value);

CREATE TABLE quota_region_caps (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  country VARCHAR(50) NOT NULL,
  region VARCHAR(100) NOT NULL,
  cap_count INTEGER,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX quota_region_caps_country_region_idx ON quota_region_caps (country, region);

ALTER TABLE leads ADD COLUMN quota_matched_dimension VARCHAR(20);
ALTER TABLE leads ADD COLUMN quota_matched_value VARCHAR(20);
```

> Recordatorio (memoria del proyecto): esta migración debe **aplicarse contra Neon** en la misma sesión en que se actualice `schema.ts`, no solo commitearse.

## Cambio de contrato en función existente: `checkQuotaAvailability`

**Antes** (`src/lib/scoring/quota.ts`):
```ts
checkQuotaAvailability({ country, nseRegion, segment, leadId? }): Promise<boolean>
```

**Después**:
```ts
interface CheckQuotaAvailabilityParams {
  country: string
  nseRegion: string
  segment: string        // NSE — sin cambios, ya calculado por getQuotaSegment()
  age: number | null      // survey_profiles.age
  householdSize: number | null  // survey_profiles.household_size
  isPregnant: boolean | null
  hasBabyUnder3: boolean | null
  leadId?: string
}

interface QuotaDecision {
  qualifies: boolean
  matchedDimension: 'nse' | 'edad' | 'integrantes' | 'exception' | null
  matchedValue: string | null
}

checkQuotaAvailability(params: CheckQuotaAvailabilityParams): Promise<QuotaDecision>
```

Los dos call sites (`phase-1.ts`, `handle-confirm.ts`) pasan `profile.age`, `profile.householdSize`, `profile.isPregnant`, `profile.hasBabyUnder3` (ya disponibles en el `profile` que ambos ya cargan) y, si `qualifies`, persisten `quota_matched_dimension`/`quota_matched_value` en el mismo `db.update(leads)` que hoy ya escribe `score`/`quotaSegment`.

**Lógica interna** (orden, ver research.md R5):

1. Si `isPregnant || hasBabyUnder3` → `{ qualifies: true, matchedDimension: 'exception', matchedValue: null }` (no evalúa nada más).
2. Si hay `quota_region_caps` para `(country, nseRegion)` con `cap_count` no nulo, y el conteo de leads en `QUALIFIED_STATUSES` de esa región (**incluyendo** los calificados por excepción) ya alcanzó `cap_count` → `{ qualifies: false, matchedDimension: null, matchedValue: null }`.
3. Evaluar en orden `nse → edad → integrantes`: para cada dimensión, buscar la fila de `quota_targets` `(country, nseRegion, dimensionType, valorDeEsaDimensión)` activa con `available > 0` (`achieved` filtrado por `quota_matched_dimension`/`quota_matched_value` exactos, ver research.md R4). La primera con cupo → `{ qualifies: true, matchedDimension, matchedValue }`.
4. Si ninguna dimensión tiene cupo → `{ qualifies: false, matchedDimension: null, matchedValue: null }`.

## `QuotaProgress` (interfaz existente en `quota-progress.ts`) — cambios

- `nseLevel: string` → `dimensionType: string; dimensionValue: string` (renombrado, mismo propósito).
- `getQuotaProgressForTarget(country, region, nseLevel)` → `getQuotaProgressForTarget(country, region, dimensionType, dimensionValue)`.
- Nueva función `getRegionCapProgress(country, region): Promise<{ cap: number | null; achieved: number } | null>` — `achieved` cuenta **todos** los leads en `QUALIFIED_STATUSES` de esa región (dimensión + excepción), para alimentar el dashboard/reporting (SC-005).

## Entidades sin cambios

- **Perfil de encuesta (`survey_profiles`)**: ya tiene `age`, `household_size`, `is_pregnant`, `has_baby_under_3`, `nse_region`, `country` — no requiere columnas nuevas.
- **Catálogo geográfico (`data/geo/cam-nse-regions.json`)**: sin cambios — sigue siendo la única fuente de verdad de qué regiones existen por país.
