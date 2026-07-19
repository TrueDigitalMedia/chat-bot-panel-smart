# Quickstart: Validar la Ficha Hogar interactiva

## Prerrequisitos

- Migración `0012_ficha_hogar.sql` aplicada (tabla nueva + valor de enum nuevo).
- Un lead de prueba que ya llegó a `code_delivered_registered` (completó Fases 1-3).

## 1. Descarte por conflicto de interés (US1)

```bash
npx playwright test tests/e2e/phase-4-discard.spec.ts
```

**Resultado esperado**: la primera pregunta de Fase 4 es la de conflicto de interés. Responder "Sí" transiciona el lead a `ficha_hogar_descartado` (no `ficha_hogar_completada`), sin generar resumen IA ni registro en Treinta.

```sql
SELECT lead_status FROM leads WHERE id = '<lead de prueba>';
-- esperado: ficha_hogar_descartado
SELECT count(*) FROM treinta_panelist_records WHERE lead_id = '<lead de prueba>';
-- esperado: 0
```

## 2. Cuestionario completo (US2)

Completar manualmente (o vía script) las 7 preguntas en orden, respondiendo "No" al conflicto de interés. Confirmar:

```sql
SELECT * FROM ficha_hogar_profiles WHERE lead_id = '<lead de prueba>';
```

Las 7 columnas deben tener valores no nulos, y `completed_at` debe estar seteado.

## 3. Validación de fecha de nacimiento

```bash
npx vitest run tests/unit/ficha-hogar-validation.test.ts
```

Enviar una fecha futura o implausible durante la pregunta 4 y confirmar que el bot vuelve a pedirla en vez de aceptarla.

## 4. Resumen IA y persistencia con datos reales (US3)

Completar un cuestionario con valores conocidos (p. ej. 2 mascotas, plan de datos ilimitado) y verificar:

```sql
SELECT data->>'petCount', summary FROM treinta_panelist_records WHERE lead_id = '<lead de prueba>';
```

El `summary` generado debe mencionar o reflejar esos datos (revisión manual — SC-004 pide muestreo QA, no una aserción automática exacta sobre texto libre de IA).

## 5. Corrección de una respuesta (FR-005)

Después de completar, activar `correctfh:menu` y confirmar que las 7 preguntas de Ficha Hogar aparecen como opciones corregibles, análogo al menú de Fase 1.

## Referencias

- Por qué esto requirió una arquitectura nueva (no solo agregar preguntas): [research.md](./research.md) R1
- Modelo de datos y máquina de estados: [data-model.md](./data-model.md)
