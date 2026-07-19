# Phase 0 Research: Dashboard de leads

## R1: No agregar `recharts` — barras con CSS/SVG simple

- **Decision**: El gráfico por país (FR-004) se implementa con divs/CSS (o SVG inline) en vez de una librería de charting.
- **Rationale**: El WIKI original (§10) proponía `recharts`, pero no está instalado (`package.json` verificado) y la cardinalidad es mínima: hoy solo CAM tiene datos reales (7 países), México/Ecuador estarán en cero hasta que se activen (spec Assumptions). Un gráfico de barras horizontal con `<div style={{width: pct+'%'}}>` cubre el requisito sin dependencia nueva — Principio III (Simplicity/YAGNI), y la constitución exige agotar el ecosistema existente antes de sumar dependencias no evaluadas.
- **Alternatives considered**: `recharts` — rechazado por no estar ya presente y no ser necesario a esta escala; una librería de charting se justificaría con más series/interactividad (zoom, tooltips complejos), que no pide ningún FR aquí.

## R2: Reusar `listQuotaProgress()` de la spec 005 en vez de duplicar el join

- **Decision**: Las cards de resumen (US1), la tabla región×NSE (US2) y el gráfico por país (parte de US1) se alimentan todos de `listQuotaProgress()` (`src/lib/quotas/quota-progress.ts`, ya implementado). Se le agregan filtros opcionales `channel` y `dateFrom`/`dateTo` (aditivos — no rompen las llamadas existentes de `checkQuotaAvailability` ni del panel `/admin/quotas`, que no los pasan).
- **Rationale**: Es exactamente la reutilización que el plan de la spec 005 anticipó ("reusable by the leads dashboard, spec 006" — ver `specs/005-quota-admin-panel/plan.md` § Structure Decision). Duplicar el join `quota_targets` ⋈ `leads` ⋈ `survey_profiles` en un módulo nuevo violaría YAGNI/DRY sin ningún beneficio.
- **Alternatives considered**: Un módulo `dashboard-progress.ts` separado con su propio query — rechazado, sin justificación funcional para divergir de la lógica ya probada en spec 005.

## R3: Embudo de conversión — nueva función, reusa `QUALIFIED_STATUSES`

- **Decision**: Nueva función `getConversionFunnel(filters)` en `src/lib/dashboard/funnel.ts`, contando leads en 7 etapas:

  | Etapa | Condición |
  |---|---|
  | 1. Iniciaron conversación | Todo lead (`count(*)` de `leads`) |
  | 2. Pasaron D1 (T&C) | `d1Accepted = true` |
  | 3. Pasaron D3 (es comprador) | `d3IsShopper = true` (implica D1+D2 ya true por construcción del flujo secuencial — ver `phase-1.ts`) |
  | 4. Completaron encuesta | `survey_profiles.completed_at IS NOT NULL` |
  | 5. Calificaron por NSE + cupo | `lead_status` ∈ `QUALIFIED_STATUSES` (mismo set exportado por `quota-progress.ts`, spec 005 research R4) |
  | 6. Registrados en app | `lead_status` ∈ `('code_delivered_registered', 'ficha_hogar_completada')` |
  | 7. Ficha Hogar completada | `lead_status = 'ficha_hogar_completada'` |

- **Rationale**: Coincide exactamente con el embudo descrito en `docs/WIKI.md` §10.4 y en spec.md US3. Reusar `QUALIFIED_STATUSES` (en vez de repetir la lista de estados) evita que las dos features diverjan silenciosamente si el set cambia en el futuro.
- **Alternatives considered**: Ninguna — el mapeo etapa→condición es directo desde el WIKI y el `LeadStatus` ya documentado.

## R4: Filtros de región/NSE NO aplican al embudo

- **Decision**: Los filtros de país y canal y rango de fechas aplican a las 3 vistas (cards, tabla, embudo). Los filtros de **región** y **nivel NSE** aplican solo a la tabla región×NSE y al gráfico por país — **no** al embudo.
- **Rationale**: `quotaSegment` (nivel NSE) y `nseRegion` solo se asignan a un lead **después** de completar la encuesta (fase 1, tras el score). Si el embudo filtrara por NSE/región, las primeras etapas ("iniciaron conversación", "pasaron D1") mostrarían conteos artificialmente bajos o vacíos, porque la mayoría de esos leads aún no tienen NSE/región asignado — el embudo dejaría de reflejar el pipeline real y en cambio mostraría un subconjunto sesgado hacia el final del flujo.
- **Alternatives considered**: Aplicar todos los filtros a todas las vistas literalmente, como sugiere la redacción de FR-006 ("todas las vistas") — rechazado porque produce un embudo engañoso; se documenta aquí como una interpretación deliberada de FR-006, no un incumplimiento. Ver `data-model.md` para el detalle exacto de qué filtro aplica a qué vista.

## R5: Sin rutas API dedicadas — el Server Component lee directo

- **Decision**: A diferencia de la spec 005 (que necesitaba `/api/admin/quotas/*` para las mutaciones desde el Client Component), esta feature es 100% lectura. `page.tsx` llama `listQuotaProgress()` y `getConversionFunnel()` directamente server-side. No se crean `/api/admin/dashboard/*` (a diferencia de lo propuesto originalmente en el WIKI §10).
- **Rationale**: Ningún FR de spec.md pide acceso externo/programático a estos datos (a diferencia de spec 005, donde el import/export sí lo requería). Agregar 4 rutas API que nadie más consume sería complejidad sin un requisito que la sostenga (Principio III).
- **Alternatives considered**: Construir las rutas API "por si acaso" un futuro consumidor externo las necesita — rechazado, YAGNI explícito.

## R6: Autenticación — cero código nuevo

- **Decision**: `/admin/dashboard` y cualquier ruta bajo `/api/admin/dashboard` (si llegaran a existir después) ya quedan cubiertas por el `matcher: ['/admin/:path*', '/api/admin/:path*']` de `src/middleware.ts` (spec 005). No se toca ese archivo.
- **Rationale**: Coincide con la Assumption explícita del spec ("reutiliza el mismo mecanismo de autenticación... spec 005"), y es simplemente cómo ya funciona el matcher de Next.js con wildcards.

## R7: "Tiempo real" = polling de 60s en el cliente, sin WebSockets

- **Decision**: Un Client Component pequeño (`refresh-poller.tsx`) hace `setInterval(() => router.refresh(), 60_000)` más un botón de refresco manual. `router.refresh()` vuelve a ejecutar el Server Component (`page.tsx`) sin perder el estado de los filtros (que viven en la URL, no en estado de React).
- **Rationale**: Cumple SC-002 (máx. 60s) y la Assumption explícita de "no WebSockets". Es el mismo patrón ya usado en `/conversations` (`BackfillEvalsButton` usa `router.refresh()` tras una mutación) — aquí se dispara por temporizador en vez de por click.
- **Alternatives considered**: Server-Sent Events / WebSockets — rechazado explícitamente por la Assumption del spec.

## Resumen de unknowns resueltos

Ningún ítem de "Technical Context" quedó como `NEEDS CLARIFICATION`. La decisión más importante para el usuario (R4, el alcance de los filtros sobre el embudo) es una interpretación editorial de un FR ambiguo — vale la pena confirmarla en la revisión de tasks/implementación si el usuario tiene una expectativa distinta.
