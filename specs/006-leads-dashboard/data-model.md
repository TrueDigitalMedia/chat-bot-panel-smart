# Phase 1 Data Model: Dashboard de leads

No se crean tablas ni columnas nuevas — esta feature es 100% lectura sobre `leads`, `survey_profiles` y `quota_targets` (ya existentes).

## Filtros — qué vista respeta cada uno

| Filtro | Cards (US1) | Tabla región×NSE (US2) | Gráfico por país | Embudo (US3) |
|---|---|---|---|---|
| País | ✅ | ✅ | ✅ (agrupa por país) | ✅ |
| Canal | ✅ | ✅ | ✅ | ✅ |
| Rango de fechas | ✅ | ✅ | ✅ | ✅ |
| Región | ✅ (vía tabla filtrada) | ✅ | — (el gráfico ya agrupa por país, región no aplica) | ❌ (ver research.md R4) |
| Nivel NSE | ✅ (vía tabla filtrada) | ✅ | — | ❌ (ver research.md R4) |

Todos los filtros llegan como `searchParams` de la URL (`?country=&region=&nseLevel=&channel=&from=&to=`), leídos directamente por el Server Component — no hay estado de cliente que sincronizar.

## `listQuotaProgress()` — firma extendida (spec 005, modificación aditiva)

```ts
// src/lib/quotas/quota-progress.ts
export interface QuotaProgressFilters {
  country?: string
  region?: string
  nseLevel?: string
  active?: boolean
  channel?: 'telegram' | 'whatsapp' | 'web'   // NUEVO
  dateFrom?: Date                              // NUEVO — leads.created_at >= dateFrom
  dateTo?: Date                                // NUEVO — leads.created_at <= dateTo
}
```

`channel`/`dateFrom`/`dateTo` son opcionales y por defecto `undefined` (sin filtrar) — las llamadas existentes de spec 005 (`checkQuotaAvailability`, `/api/admin/quotas`) no los pasan y su comportamiento no cambia.

## Entidad derivada (no persistida): `ConversionFunnel`

```ts
// src/lib/dashboard/funnel.ts
export interface FunnelStage {
  key: 'started' | 'passed_d1' | 'passed_d3' | 'survey_completed' | 'qualified' | 'registered' | 'ficha_hogar_completada'
  label: string       // texto en español para mostrar
  count: number
  pctOfPrevious: number  // % respecto a la etapa anterior (0 en la primera etapa)
  pctOfTotal: number     // % respecto a la etapa 1
}

export interface ConversionFunnel {
  stages: FunnelStage[]
  biggestDropStageKey: FunnelStage['key'] | null  // la etapa con mayor caída vs. la anterior (SC-004)
}
```

## Filtros de `getConversionFunnel()`

```ts
export interface FunnelFilters {
  country?: string
  channel?: 'telegram' | 'whatsapp' | 'web'
  dateFrom?: Date
  dateTo?: Date
  // NOTA: sin region/nseLevel — ver research.md R4
}
```

## Relación con entidades existentes

```
leads (channel, country* via join, d1Accepted, d3IsShopper, leadStatus, quotaSegment, createdAt)
  │
  ├─ survey_profiles (country, nseRegion, completedAt)  — 1:1, creado junto con el lead
  │
  └─ quota_targets (spec 005)  — join lógico por (country, nseRegion, quotaSegment)

listQuotaProgress(filters) → cards + tabla región×NSE + gráfico por país
getConversionFunnel(filters) → embudo de 7 etapas
```

*(`country*` en `leads` es vía `survey_profiles.country` — `leads` no tiene columna de país propia.)*

## Edge cases cubiertos por el modelo

- **Región/NSE sin objetivo (target=0)**: ya manejado por `toProgress()` de spec 005 (`progressPct = 0` sin dividir por cero).
- **Filtro sin resultados**: `listQuotaProgress`/`getConversionFunnel` devuelven arrays vacíos / conteos en 0 — la UI muestra un estado vacío, no un error (mismo patrón que `/admin/quotas`).
- **País sin cuotas (México/Ecuador)**: aparecen en el embudo si tienen leads reales, pero no aparecen en la tabla región×NSE / gráfico hasta que existan filas `quota_targets` para ellos (consistente con el Assumption del spec).
