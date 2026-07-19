# Quickstart: Validar las nuevas preguntas de Fase 1

## Prerrequisitos

- Migración `0011_fase1_new_questions.sql` aplicada (incluye el backfill de `opt_in_accepted` — research.md R2).
- Dev server corriendo con webhook de Telegram configurado (o mock).

## 1. Opt-in gate (US1)

```bash
npx playwright test tests/e2e/phase-1-optin.spec.ts
```

**Resultado esperado**: un lead nuevo recibe la pregunta de opt-in como primer mensaje, antes de T&C. Responder `optin:decline` transiciona a `not_qualified` sin mostrar D1.

## 2. Leads existentes no ven el opt-in retroactivamente (research.md R2)

```sql
SELECT opt_in_accepted, count(*) FROM leads WHERE created_at < now() GROUP BY opt_in_accepted;
```

**Resultado esperado**: inmediatamente después de aplicar la migración (antes de que entre tráfico nuevo), el 100% de las filas existentes tiene `opt_in_accepted = true`.

## 3. Preguntas 17-19 al final de la encuesta (US2/US3/US4)

```bash
npx vitest run tests/unit/survey-question-count.test.ts
```

Completar una encuesta de prueba de punta a punta y confirmar que, después de la pregunta 16 (horario de contacto, sin cambios), el bot pregunta edad → embarazo → bebé<3, en ese orden, antes de finalizar.

## 4. El score no cambia (SC-004)

```bash
npx vitest run tests/unit/scoring.test.ts tests/unit/qualification-eval.test.ts
```

Deben seguir en verde sin ninguna modificación — es la prueba de regresión de que `ScoringFields` no incluye los campos nuevos.

## 5. Corrección de las respuestas nuevas (FR-007)

En una conversación de prueba, activar el menú de corrección (`correct:menu`) después de completar la encuesta y confirmar que "Edad", "Embarazo" y "Bebé menor de 3 años" aparecen como opciones corregibles junto a las 16 anteriores — verifica que `FIELD_LABELS`/`SURVEY_FIELDS` quedaron correctamente registrados (el menú se genera dinámicamente, sin lista hardcodeada aparte).

## Referencias

- Riesgos de producción y su mitigación (reindexado, backfill): [research.md](./research.md)
- Campos y constantes compartidas afectadas: [data-model.md](./data-model.md)
