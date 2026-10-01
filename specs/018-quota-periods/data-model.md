# Data Model: Periodos de cuota y cortes (Q1–Q4)

Migración: `src/lib/db/migrations/0037_quota_periods.sql` (journal idx 21).

## `quota_periods` (nueva)

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `country` | varchar(50) NOT NULL | canonicalizado vía `registry.ts` |
| `label` | varchar(40) NOT NULL | elegido por el operador; default `Q{quarter} {year}` |
| `year` | smallint NOT NULL | |
| `quarter` | smallint NOT NULL | CHECK 1..4 |
| `starts_on` | date NOT NULL | **descriptiva** — el motor de decisión no la lee |
| `ends_on` | date NOT NULL | CHECK `>= starts_on` |
| `status` | varchar(16) NOT NULL default `'open'` | CHECK `open`\|`closed` |
| `opened_at` | timestamptz NOT NULL | |
| `closed_at` | timestamptz | |
| `notes` | text | |

Índices:
- `quota_periods_one_open_per_country_idx` **UNIQUE PARCIAL** `(country) WHERE status='open'` — es lo
  que realmente impone "a lo sumo un abierto por país"; el pre-chequeo en código solo da un error
  legible y la carrera se atrapa por el `23505`.
- `quota_periods_country_label_idx` UNIQUE `(country, label)`.
- `quota_periods_id_country_idx` UNIQUE `(id, country)` — redundante con la PK, pero es la clave
  referenciable de las FK compuestas de abajo.

**Sin** restricción de solapamiento de fechas: son metadata descriptiva, y una exclusion constraint
exigiría `btree_gist` y bloquearía casos legítimos (retro-datar un periodo, cerrar Q1 y abrir Q2 el
mismo día) sin ningún beneficio de comportamiento.

## `quota_targets` / `quota_region_caps` (modificadas)

| Columna | Tipo | Notas |
|---|---|---|
| `period_id` | uuid NOT NULL → `quota_periods(id)` ON DELETE CASCADE | **nueva** |

`country` se mantiene denormalizado (lo leen todos los filtros y el importador/exportador de Excel),
protegido con FK compuesta `(period_id, country) → quota_periods(id, country)`.

Índices únicos reemplazados — la misma celda tiene que poder existir en Q1 y en Q2:

| Dropeado | Creado |
|---|---|
| `quota_targets_country_region_dim_idx` | `quota_targets_period_region_dim_idx (period_id, region, dimension_type, dimension_value)` |
| `quota_region_caps_country_region_idx` | `quota_region_caps_period_region_idx (period_id, region)` |

> `upsertQuotaTarget` emite su `ON CONFLICT` con esa tupla **literal**: un desajuste no lo ve
> TypeScript, revienta en runtime con *"there is no unique or exclusion constraint matching the ON
> CONFLICT specification"*.

## `leads` (columna nueva)

| Columna | Tipo | Notas |
|---|---|---|
| `quota_period_id` | uuid → `quota_periods(id)` ON DELETE SET NULL | el periodo contra cuya cuota calificó. NULL mientras no haya calificado. |

Índices: `(quota_period_id, lead_status)` y `(quota_period_id, quota_matched_dimension, quota_matched_value)`.

Se sella una sola vez, al calificar, en la misma escritura que `quota_matched_dimension`/
`quota_matched_value` (`phase-1.ts`, `handle-confirm.ts`). `ON DELETE SET NULL` para que borrar un
periodo nunca se trabe por orden de FK (harness de regresión incluido).

## `quota_period_snapshots` (nueva) — el corte congelado

| Columna | Tipo | Notas |
|---|---|---|
| `period_id` | uuid NOT NULL → `quota_periods(id)` ON DELETE CASCADE | |
| `scope` | varchar(10) NOT NULL | CHECK `region`\|`cell` |
| `country`, `region` | varchar | |
| `dimension_type`, `dimension_value` | varchar NOT NULL DEFAULT `''` | `''` (no NULL) en filas de región |
| `objective`, `achieved`, `missing`, `progress_pct` | integer NOT NULL | |
| `source` | varchar(10) | `cap`\|`nse_sum`\|`none` — solo filas de región |
| `deactivated` | boolean NOT NULL | |

UNIQUE `(period_id, scope, region, dimension_type, dimension_value)`.

**`''` y no NULL**: en Postgres los NULL son distintos entre sí, así que con NULL el índice único no
chocaría y un cierre reintentado duplicaría las filas de región — justo la idempotencia que se busca.

**No hay tabla de leads por corte.** `leads.quota_period_id` ya es ese registro, y reconstruye el
conjunto exacto con `WHERE quota_period_id = ? AND lead_status IN (QUALIFIED_STATUSES)`. Una copia
congelada de filas de lead empezaría a discrepar de `leads` en cuanto un lead avance de estado
después del cierre (p. ej. a `ficha_hogar_descartado`), y tendríamos dos verdades. Los enteros del
snapshot son el libro mayor; la lista de leads (export CSV) es la verdad actual.

## Por qué el sello y no una ventana de fechas

1. **Inmutabilidad** — editar las fechas de un periodo re-atribuiría leads y movería los números de
   un corte ya cerrado.
2. **Momento de calificación ≠ momento de creación** — un lead puede empezar la encuesta en Q1 y
   pasar el chequeo en Q2; solo el sello sabe qué cuota consumió.
3. El diseño permite rangos solapados, lo que vuelve ambigua cualquier ventana por construcción.
4. Igualdad indexada > range scan sobre `created_at` con join a `survey_profiles`.

`AchievedFilters.dateFrom/dateTo` siguen siendo filtros de dashboard que **intersectan** con el
alcance de periodo; nunca lo reemplazan.
