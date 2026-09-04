# Phase 1 Data Model: Panel administrativo de cuotas

## Entidad nueva: `QuotaTarget` (tabla `quota_targets`)

| Campo | Tipo | Notas |
|---|---|---|
| `id` | `uuid`, PK, default random | |
| `country` | `varchar(50)` | Uno de los 7 países CAM (`Guatemala`, `Honduras`, `El Salvador`, `Nicaragua`, `Costa Rica`, `Rep. Dominicana`, `Panamá`) — mismos valores exactos que la pregunta de país de la encuesta y `canonicalCountry()`. |
| `region` | `varchar(100)` | Uno de los valores de `listNseRegionsForCountry(country)` (catálogo geográfico real, no texto libre — ver research.md R3). |
| `nseLevel` | `varchar(20)` | `'Nivel 1' \| 'Nivel 2' \| 'Nivel 3' \| 'Nivel 4'` — mismos valores que `getQuotaSegment()` (spec 004). |
| `targetCount` | `integer`, default 0 | "Objetivo" del Excel. 0 es un valor válido y significa "sin cupo en esta combinación" (14 de las 33 regiones tienen algún nivel en 0). |
| `active` | `boolean`, default `true` | Si es `false`, la combinación se excluye del chequeo de cupo aunque `targetCount` sea > conseguidos (US4). |
| `notes` | `text`, nullable | Campo libre para contexto administrativo (p. ej. "cerrado por Kantar 2026-08"). |
| `createdAt` | `timestamp with time zone`, default now | |
| `updatedAt` | `timestamp with time zone`, default now | Se actualiza en cada edición — es la "trazabilidad básica" de FR-010; no se modela un log de auditoría separado (YAGNI — nadie pidió historial de valores anteriores, solo cuándo cambió por última vez). |

**Constraint**: `UNIQUE(country, region, nse_level)` — coincide con el diseño original propuesto en `docs/WIKI.md` §9 y evita duplicados por reimportación (el importador hace upsert sobre esta clave).

**Migration**: `src/lib/db/migrations/0010_quota_targets.sql` (siguiente número disponible tras `0009_conversation_evals.sql`).

## Entidad derivada (no persistida): `QuotaProgress`

Resultado de cruzar `QuotaTarget` con el conteo real de leads calificados. No es una tabla — es la forma de retorno de `getQuotaProgress()` en `src/lib/quotas/quota-progress.ts`.

| Campo | Tipo | Cálculo |
|---|---|---|
| `country`, `region`, `nseLevel` | `string` | De `QuotaTarget`. |
| `target` | `number` | `QuotaTarget.targetCount`. |
| `achieved` | `number` | `COUNT(leads)` con `leadStatus IN QUALIFIED_STATUSES` (ver research.md R4) `AND quotaSegment = nseLevel`, unido a `survey_profiles` por `leadId` filtrando `country`/`nseRegion`. |
| `available` | `number` | `Math.max(0, target - achieved)`. |
| `active` | `boolean` | De `QuotaTarget.active`. |
| `progressPct` | `number` | `target > 0 ? Math.min(100, Math.round((achieved / target) * 100)) : 0` — usado para el color-coding que la spec 006 (dashboard) también consumirá. |

## Relación con entidades existentes (sin cambios de esquema)

```
Lead (leads)                    SurveyProfile (survey_profiles)
  id                    1 ─── 1   leadId
  leadStatus                      country          ─┐
  quotaSegment  ──────────────────────────────────┐  nseRegion       ─┼─ join key hacia QuotaTarget
                                                    │                 │  (country, nseRegion, quotaSegment)
                                                    ▼                 ▼
                                          QuotaTarget (quota_targets) [NUEVO]
                                            country, region, nse_level, target_count, active
```

`QuotaTarget` no tiene FK hacia `leads`/`survey_profiles` — es un join lógico en tiempo de consulta (país+región+nivel), igual que el diseño original del WIKI. Esto es intencional: una cuota puede existir sin ningún lead todavía, y un lead no referencia directamente una fila de cuota.

## Cambio de contrato en función existente: `checkQuotaAvailability`

**Antes** (`src/lib/scoring/quota.ts`):
```ts
checkQuotaAvailability(segment: string, leadId?: string): Promise<boolean>
```

**Después**:
```ts
checkQuotaAvailability(params: {
  country: string
  nseRegion: string
  segment: string
  leadId?: string
}): Promise<boolean>
```

Ambos call sites (`phase-1.ts` línea ~272, `handle-confirm.ts` línea ~94) ya tienen `profile.country` y `profile.nseRegion` cargados en el mismo bloque donde llaman a esta función — el cambio de firma no introduce ninguna consulta nueva a la base de datos.

## Datos de migración inicial (de `docs/cam/Kantar Quotas Test.xlsx`, hoja `CAM`)

Verificado programáticamente (ver research.md R1): **33 filas de región × 4 niveles = 132 filas `QuotaTarget`**, objetivo total agregado = 3494, conseguidos actuales (al momento del análisis) = 159. Esta cifra reemplaza el "19 regiones" que aparecía en el WIKI §8 (transcripción incompleta — omitía filas con objetivo 0 en los 4 niveles).
