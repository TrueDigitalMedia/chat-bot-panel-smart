# Quickstart: Validar cuotas flexibles por dimensión

## Prerrequisitos

- Migración `0014_flexible_quota_matching.sql` aplicada contra la DB de desarrollo/Neon (ver data-model.md).
- Al menos una fila de `quota_targets` por cada `dimension_type` para una misma región de prueba, y opcionalmente una fila en `quota_region_caps` para esa región.

## 1. Sembrar datos de prueba (Honduras — Nor Occidente I, ejemplo del negocio)

```sql
INSERT INTO quota_targets (country, region, dimension_type, dimension_value, target_count) VALUES
  ('Honduras', 'Nor Occidente I', 'nse', 'Nivel 1', 0),
  ('Honduras', 'Nor Occidente I', 'edad', '50+', 0),
  ('Honduras', 'Nor Occidente I', 'integrantes', '5+', 22);
```

## 2. Validar el matching OR con tests unitarios (Vitest)

Extender `tests/unit/quota-progress.test.ts` y `tests/unit/quota-targets.test.ts` (o el nuevo `tests/unit/quota-check.test.ts`) con casos que reproduzcan los ejemplos del spec:

```bash
yarn vitest run tests/unit/quota-check.test.ts
```

**Casos a cubrir** (ver spec.md User Stories 1-4 para el detalle Given/When/Then):
- Lead con NSE y edad agotados pero integrantes con cupo → califica, `matchedDimension: 'integrantes'`.
- Lead con NSE con cupo → califica y descuenta solo la fila de NSE, no las de edad/integrantes aunque también las cumpla.
- Lead con `isPregnant: true` en una región con las tres dimensiones agotadas → igual califica (`matchedDimension: 'exception'`).
- Región con `quota_region_caps.cap_count` alcanzado → nuevo lead no califica aunque una dimensión tenga cupo; un lead con excepción de embarazo/bebé sí califica igual.

## 3. Validar el flujo end-to-end del bot

```bash
yarn vitest run tests/e2e/quota-check-real.spec.ts
```

Simula una encuesta completa hasta el punto de `checkQuotaAvailability` y confirma la transición correcta a `link_sent` o `quota_exhausted` según los datos sembrados en el paso 1.

## 4. Validar el panel administrativo

```bash
yarn dev
```

1. Abrir `/admin/quotas`, iniciar sesión.
2. Confirmar que el formulario de creación de cupo ahora pide `dimensionType` (NSE / Edad / Integrantes) antes del valor.
3. Confirmar la nueva sección de "Tope por región" — crear un tope para "Honduras / Nor Occidente I" y verificar que aparece con `achieved` calculado.
4. Importar `docs/Muestra Faltante por País Julio 2026_True.xlsx` (hoja Honduras) vía el botón de importar y verificar que las celdas se cargan como filas `quota_targets` con el `dimensionType` correcto.

## 5. Confirmar que el reporting no se rompe (spec 006)

Abrir `/admin/dashboard` y verificar que la tabla región×NSE sigue funcionando (ahora filtrando `quota_matched_dimension = 'nse'` para esa vista específica) y que hay visibilidad de cuántos leads se calificaron por cada dimensión (SC-005).
