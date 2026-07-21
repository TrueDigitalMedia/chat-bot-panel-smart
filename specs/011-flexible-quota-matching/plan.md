# Implementation Plan: Cuotas flexibles por dimensión

**Branch**: `011-flexible-quota-matching` | **Date**: 2026-07-20 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/011-flexible-quota-matching/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

Reemplazar el chequeo de cupo actual (`country + region + NSE` deben coincidir a la vez, spec 005) por un matching OR entre tres dimensiones independientes (NSE, edad, integrantes) evaluadas en orden fijo, abrir todas las regiones, agregar un tope agregado manual por región, y calificar sin límite a hogares con embarazo o bebé de 0-36 meses. Enfoque técnico: generalizar `quota_targets` con una columna `dimension_type`, agregar `quota_region_caps` para el tope por región, y dos columnas de atribución en `leads` (`quota_matched_dimension`/`quota_matched_value`) para que cada lead solo descuente la dimensión que lo calificó (ver research.md y data-model.md).

## Technical Context

**Language/Version**: TypeScript 5 (strict mode), Node.js — sin cambios respecto al resto del proyecto.

**Primary Dependencies**: Next.js 16.2 (App Router), Drizzle ORM 0.45 sobre PostgreSQL (Neon serverless), Vercel AI SDK (no tocado por esta feature).

**Storage**: PostgreSQL (Neon) vía Drizzle — reutiliza `db/schema.ts` y el pipeline de migraciones SQL manuales ya establecido (`src/lib/db/migrations/*.sql`).

**Testing**: Vitest (unit — `tests/unit/quota-*.test.ts`), Playwright (e2e — `tests/e2e/quota-check-real.spec.ts`).

**Target Platform**: Vercel (edge/serverless), igual que el resto del proyecto.

**Project Type**: Web application (Next.js single-project — no hay separación frontend/backend, todo vive bajo `src/`).

**Performance Goals**: Sin cambios de perfil — el chequeo de cupo sigue siendo una operación síncrona de fin de encuesta (hoy 1 query; pasa a hasta 4 queries secuenciales — región cap + hasta 3 dimensiones — todavía muy por debajo de cualquier límite de latencia percibido por el usuario en un flujo de chat).

**Constraints**: Ninguna nueva — mismas restricciones que spec 005 (Basic Auth en `/admin/quotas`, sin frameworks nuevos).

**Scale/Scope**: Mismo scope geográfico que hoy (CAM + México + Ecuador + RD), pero con hasta 3x el número de filas en `quota_targets` por región (una por dimensión en vez de una combinada) más una fila nueva en `quota_region_caps` por región configurada.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. AI Safety & Guardrails** — N/A directo: esta feature no toca el prompt layer ni la salida del LLM; solo lógica de negocio determinística sobre datos ya validados. ✅ PASS (no aplica).
- **II. Observability First** — El evento `quota_check` ya logueado en `checkQuotaAvailability` se extiende con `matched_dimension`, `matched_value`, `region_cap_blocked` (ver contracts/quota-check-contract.md § Logging), preservando trazabilidad end-to-end de cada decisión de cupo. ✅ PASS.
- **III. Simplicity / YAGNI** — Se generaliza la tabla existente (`dimension_type` + `dimension_value`) en vez de crear tres tablas paralelas; el tope de región es una tabla nueva solo porque es una entidad conceptualmente distinta (ver research.md R1/R2). No se introduce ninguna abstracción no solicitada por el spec. ✅ PASS.
- **IV. Flexible Quota Eligibility (nuevo, este mismo ciclo)** — Esta feature **es** la implementación directa del Principio IV: matching OR por dimensión (FR-001), todas las regiones abiertas (FR-002), tope agregado por región (FR-004), excepción embarazo/bebé sin límite (FR-003). ✅ PASS por diseño — ver Requirements en spec.md.

**Resultado**: Sin violaciones. No se requiere Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/011-flexible-quota-matching/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
│   ├── quota-check-contract.md
│   └── admin-quotas-api-changes.md
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

Proyecto único Next.js (App Router) — no hay separación frontend/backend como proyectos distintos. Archivos existentes que se modifican y archivos nuevos que se agregan:

```text
src/lib/db/
├── schema.ts                              # MODIFICAR: quotaTargets (dimensionType/dimensionValue), quotaRegionCaps (nueva), leads.quotaMatchedDimension/Value
└── migrations/
    └── 0014_flexible_quota_matching.sql   # NUEVO — ver data-model.md

src/lib/scoring/
└── quota.ts                               # MODIFICAR: checkQuotaAvailability (nueva firma + orden de evaluación), ver contracts/quota-check-contract.md

src/lib/quotas/
├── quota-progress.ts                      # MODIFICAR: getQuotaProgressForTarget por dimensión, nueva getRegionCapProgress
├── quota-targets.ts                       # MODIFICAR: CRUD por dimensionType/dimensionValue
├── dimension-catalog.ts                   # NUEVO: NSE_LEVELS/AGE_BANDS/HOUSEHOLD_BANDS/DIMENSION_TYPES sin import de DB — para que componentes 'use client' los usen sin arrastrar db/client.ts al bundle
├── region-caps.ts                         # NUEVO: CRUD de quota_region_caps
├── quota-bands.ts                         # NUEVO: ageBand()/householdBand() (research.md R3) — funciones puras
├── excel-import.ts                        # MODIFICAR: nuevo layout por dimensión (ver contracts/admin-quotas-api-changes.md)
└── excel-export.ts                        # MODIFICAR: idem, round-trip con el nuevo layout

src/lib/conversation/phases/
└── phase-1.ts                             # MODIFICAR: pasa age/householdSize/isPregnant/hasBabyUnder3 a checkQuotaAvailability, persiste quotaMatchedDimension/Value

src/lib/geo/
└── handle-confirm.ts                      # MODIFICAR: mismo cambio que phase-1.ts (segundo call site duplicado)

src/app/admin/quotas/
├── page.tsx                               # MODIFICAR: columnas dimensionType/dimensionValue, nueva sección de topes por región
├── quota-row-form.tsx                     # MODIFICAR: columnas dimensionType/dimensionValue
├── new-quota-target-row.tsx               # NUEVO: fila para crear cupos por País/Región/Dimensión/Valor/Objetivo (antes solo se podía crear vía import Excel)
└── region-cap-form.tsx                    # NUEVO

src/app/api/admin/quotas/
├── route.ts                               # MODIFICAR: query params/body con dimensionType
├── [id]/route.ts                          # sin cambios de forma (sigue patcheando por id)
├── import/route.ts                        # MODIFICAR: nuevo layout
├── export/route.ts                        # MODIFICAR: nuevo layout
└── region-caps/
    ├── route.ts                           # NUEVO
    └── [id]/route.ts                      # NUEVO

tests/unit/
├── quota-progress.test.ts                 # MODIFICAR
├── quota-targets.test.ts                  # MODIFICAR
├── quota-excel-import.test.ts             # MODIFICAR
├── quota-check.test.ts                    # NUEVO — casos OR-matching de spec.md User Stories 1-4
└── quota-bands.test.ts                    # NUEVO — ageBand()/householdBand()

tests/e2e/
└── quota-check-real.spec.ts               # MODIFICAR: escenarios con las nuevas dimensiones
```

**Structure Decision**: Se mantiene la estructura de proyecto único ya establecida (`src/lib/*` para lógica de dominio, `src/app/*` para rutas Next.js). No se introduce ningún directorio ni capa nueva — todos los archivos nuevos (`region-caps.ts`, `quota-bands.ts`, las rutas `region-caps/*`) siguen el mismo patrón de los archivos hermanos que ya existen en esos mismos directorios (spec 005).

## Complexity Tracking

*Sin violaciones — Constitution Check pasa sin excepciones (ver arriba). Tabla vacía intencionalmente.*
