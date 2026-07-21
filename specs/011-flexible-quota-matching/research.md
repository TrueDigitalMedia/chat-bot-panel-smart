# Research: Cuotas flexibles por dimensión

## R1: Modelo de datos para cupos independientes por dimensión

**Decision**: Generalizar la tabla `quota_targets` reemplazando la columna fija `nse_level` por un par `dimension_type` (`'nse' | 'edad' | 'integrantes'`) + `dimension_value` (texto libre validado por catálogo según el tipo: `SCL1..SCL4` para NSE, `Hasta 34 | 35 a 49 | 50+` para edad, `1 a 2 | 3 a 4 | 5+` para integrantes). Unique index pasa de `(country, region, nse_level)` a `(country, region, dimension_type, dimension_value)`.

**Rationale**: Mantiene una sola tabla y un solo modelo CRUD/import-export (mínimo cambio de superficie), en vez de tres tablas paralelas (`quota_targets_nse`, `_edad`, `_integrantes`). El código que ya filtra/pagina/agrega (`listQuotaTargets`, `listQuotaProgress`, importador/exportador Excel) se adapta agregando una columna, no reescribiendo su forma.

**Alternatives considered**:
- Tres tablas separadas por dimensión — rechazado: tríplica el código CRUD/import-export para el mismo propósito (violación de Principio III / YAGNI).
- Guardar cupos como JSON por región — rechazado: pierde las validaciones/índices únicos de Postgres y complica las queries de `achieved` que hoy son SQL simple.

## R2: Tope agregado por región

**Decision**: Nueva tabla `quota_region_caps` con `(country, region)` único + `cap_count` (nullable) + `notes` + timestamps. `cap_count = NULL` significa "sin tope" (FR-006 edge case).

**Rationale**: Es una dimensión conceptualmente distinta de `quota_targets` (no tiene `dimension_type`/`dimension_value`, es un límite agregado independiente por FR-004/decisión del usuario: "valor manual nuevo por región"). Una tabla separada evita forzar una fila especial dentro de `quota_targets` con semántica distinta al resto.

**Alternatives considered**: Agregar `region_cap` como columna repetida en cada fila de `quota_targets` de esa región — rechazado: duplica el mismo valor N veces (una por dimensión configurada) y complica mantenerlo consistente.

## R3: Bandas de edad e integrantes

**Decision**: Las bandas se calculan en código a partir de los campos numéricos ya existentes (`survey_profiles.age`, `survey_profiles.household_size`) mediante funciones puras de bucketing, no se almacenan como texto en el lead:

```
ageBand(age): age <= 34 → 'Hasta 34' | age <= 49 → '35 a 49' | age >= 50 → '50+'
householdBand(size): size <= 2 → '1 a 2' | size <= 4 → '3 a 4' | size >= 5 → '5+'
```

**Rationale**: `age` y `household_size` ya se capturan hoy (spec 007 y encuesta original) — no hace falta ninguna pregunta nueva ni columna nueva para esto. Bucketing en código (puro, testeable con Vitest sin DB) evita duplicar la banda como string y desincronizarse del valor numérico real.

**Alternatives considered**: Guardar la banda como columna calculada en la DB (trigger o columna generada) — rechazado por Principio III: no hay necesidad demostrada de que la banda persista; se puede derivar en cada chequeo con un cálculo trivial O(1).

## R4: Atribución de qué dimensión califica a un lead (FR-007)

**Decision**: Agregar a `leads` dos columnas nuevas: `quota_matched_dimension` (`'nse' | 'edad' | 'integrantes' | 'exception' | NULL`) y `quota_matched_value` (varchar, el valor concreto que se usó, p. ej. `'SCL4'` o `'5+'`). El conteo de "conseguidos" de cada celda de `quota_targets` se calcula filtrando por `quota_matched_dimension` + `quota_matched_value` exactos, no por "el lead simplemente tiene ese valor" — así un lead que califica por integrantes no descuenta también la columna de NSE aunque su NSE real también tuviera cupo, cumpliendo la decisión del usuario ("solo se descuenta de la dimensión que lo calificó").

**Rationale**: Es la única forma de que dos columnas independientes (`achieved` de NSE vs. `achieved` de edad) no cuenten el mismo lead dos veces sin coordinación explícita. `leads.quota_segment` (columna ya existente) se conserva sin cambios para reporting del NSE real (FR-008); las columnas nuevas son solo para saber qué contador se decrementó.

**Alternatives considered**: Inferir la dimensión "ganadora" en tiempo de lectura recorriendo `quota_targets` cada vez — rechazado: no es determinista si los objetivos cambian después de que el lead ya calificó (el histórico de qué dimensión se usó dejaría de ser reproducible).

## R5: Orden de evaluación fijo NSE → edad → integrantes

**Decision**: `checkQuotaAvailability` evalúa las tres dimensiones en ese orden fijo y usa/decrementa la primera con cupo disponible. No es configurable por región ni por país.

**Rationale**: Decisión explícita del usuario en /speckit-specify (pregunta 2). Un orden fijo es predecible y trivial de auditar en logs.

## R6: Nomenclatura de niveles NSE — `SCL{n}` (Excel de negocio) vs `Nivel {n}` (código actual)

**Decision**: `getQuotaSegment()` (spec 004) sigue devolviendo `'Nivel 1'..'Nivel 4'` sin cambios — es la lógica de scoring oficial Kantar y esta feature no la toca (ver Assumptions del spec). Los nuevos `quota_targets` con `dimension_type='nse'` usan también `'Nivel 1'..'Nivel 4'` como `dimension_value` (mismo ordinal que `SCL1..SCL4` del Excel de negocio — `SCL1` = `Nivel 1`, etc.). El importador de Excel (`excel-import.ts`) es responsable de traducir el prefijo `SCL` → `Nivel` al parsear, igual que hoy ya traduce nombres de país/región.

**Rationale**: Evita introducir una segunda nomenclatura NSE en el código (`SCL1` en `quota_targets`, `Nivel 1` en `leads.quota_segment`) que exigiría un mapeo permanente en cada lectura. Centralizar la traducción en el importador (un solo punto) es más simple que traducir en cada query.

**Alternatives considered**: Migrar todo el código a `SCL{n}` — rechazado: `getQuotaSegment` y toda la fórmula SCL-CAM (spec 004) ya están en producción devolviendo `Nivel {n}`; renombrar es una migración de datos innecesaria para esta feature (fuera de alcance del spec).

## R7: Compatibilidad con el panel admin e importador/exportador Excel (spec 005)

**Decision**: El panel `/admin/quotas` y las rutas `POST/GET /api/admin/quotas*` se extienden (no se reemplazan) para incluir un selector de `dimension_type` al crear/editar una celda, y una sección aparte para el tope agregado por región (`quota_region_caps`, CRUD simple sin Excel). El importador (`excel-import.ts`) se actualiza para leer el nuevo layout por dimensión (columnas `SCL1..SCL4 | Hasta 34 | 35 a 49 | 50+ | 1 a 2 | 3 a 4 | 5+` por región) en vez del layout Objetivo/Conseguidos/Disponibles antiguo.

**Rationale**: El spec (FR-009) exige explícitamente que el panel soporte el nuevo modelo; reemplazar el import/export desde cero duplicaría lógica de parsing de país/región (`canonicalCountry`, `canonicalNseRegion`) que ya existe y funciona.

## Resumen de NEEDS CLARIFICATION resueltos

Ninguno pendiente — las tres preguntas de negocio (tope manual por región, atribución de una sola dimensión, conteo de excepción embarazo/bebé en el total) ya se resolvieron en `/speckit-specify` y quedan reflejadas en R2, R4 y en `data-model.md`.
