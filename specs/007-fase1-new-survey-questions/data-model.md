# Phase 1 Data Model: Nuevas preguntas de Fase 1

## Cambios a `leads` (tabla existente)

| Campo | Tipo | Notas |
|---|---|---|
| `opt_in_accepted` | `boolean NOT NULL` | Nuevo. Mismo patrón que `d1_accepted`. **Backfill a `true` para filas existentes, default `false` para nuevas** (research.md R2). |

## Cambios a `survey_profiles` (tabla existente)

| Campo | Tipo | Notas |
|---|---|---|
| `age` | `smallint`, nullable | Texto libre, extraído vía IA (rango de validación de extracción 13-100 — solo sanity check, no elegibilidad). **Nota (2026-08-12)**: hoy vive en el índice 8 del array (justo después de género), no en el índice 17 que documentaba esta fila originalmente — el orden se movió en algún punto posterior no documentado; ver `specs/013-conversation-ai-improvements`. Desde 2026-08-12, además, cualquier valor menor a 18 descalifica al lead (`not_qualified`, reason `age_minor`) — ver `specs/013-conversation-ai-improvements/spec.md` User Story 5. |
| `is_pregnant` | `boolean`, nullable | Pregunta #18. Botón Sí/No. |
| `has_baby_under_3` | `boolean`, nullable | Pregunta #19. Botón Sí/No. |

Ninguno de los tres participa en `ScoringFields` (`Pick<SurveyProfile, 'educationPsh'|'cars'|'domesticHelp'|'householdSize'|'bedrooms'>`) — garantizado a nivel de tipos, no solo por convención, así que SC-004 (el score no cambia) no puede romperse por accidente futuro.

## Nuevo decision point: Opt-in (antes de D1)

Mismo patrón que D1/D2/D3 en `phase-1.ts` — no es parte de `SURVEY_QUESTIONS`, es un gate propio:

```
lead.optInAccepted === false (default)
  ├─ callback 'optin:accept' → optInAccepted=true → continúa a D1
  ├─ callback 'optin:decline' → transitionLead(not_qualified, 'opt_in_decline') → EXIT_A
  └─ cualquier otro input → re-envía la pregunta de opt-in
```

## Extensión de las tablas compartidas de la encuesta

| Tabla / constante | Archivo | Cambio |
|---|---|---|
| `SurveyProfile` (interfaz) | `src/types/lead.ts` | +`age`, `isPregnant`, `hasBabyUnder3` |
| `SURVEY_FIELDS` | `src/types/lead.ts` | +`'age'`, `'isPregnant'`, `'hasBabyUnder3'` al final → longitud 16→19 |
| `BUTTON_FIELDS` | `src/types/lead.ts` | +`'isPregnant'`, `'hasBabyUnder3'` |
| `FREE_TEXT_FIELDS` | `src/types/lead.ts` | +`'age'` |
| `SURVEY_QUESTIONS` | `src/lib/conversation/survey-questions.ts` | +3 entradas, índices 17-19 |
| `SURVEY_QUESTION_COUNT` | `src/lib/conversation/survey-questions.ts` | Nuevo — `SURVEY_QUESTIONS.length`, reemplaza el `16` hardcodeado en 7 lugares (research.md R4) |
| `FIELD_LABELS` | `src/lib/conversation/correction-fields.ts` | +3 entradas (para el menú de corrección) |
| `FIELD_ALIASES` | `src/lib/conversation/correction-fields.ts` | +sinónimos ("edad", "embarazo"/"embarazada", "bebé") |
| `BUTTON_PREFIXES` | `src/lib/conversation/flow-router.ts` | +`'optin:'`, `'isPregnant:'`, `'hasBabyUnder3:'` |
| `FIELD_SCHEMAS` | `src/lib/ai/extract-survey-fields.ts` | +`age: z.object({ value: z.number().int().min(13).max(100).nullable() })` |

## Máquina de estados

Sin cambios estructurales — `incomplete → not_qualified` ya es una transición válida (usada por `d1_decline`/`d2_decline`); el opt-in decline la reusa con un nuevo `reason` string (`'opt_in_decline'`), sin necesitar tocar `transitions.ts`.

## Preguntas nuevas — texto y tipo (fuente: `docs/WIKI.md` §5)

| # (array) | Campo | Texto | Tipo |
|---|---|---|---|
| — (gate) | `optInAccepted` | "¿Te gustaría inscribirte en PanelSmart y comenzar a ganar premios?" | Botón: Inscribirme / No |
| 17 | `age` | "¿Cuántos años cumplidos tienes?" | Texto libre (13-100) |
| 18 | `isPregnant` | "¿Te encuentras actualmente embarazada?" | Botón: Sí / No |
| 19 | `hasBabyUnder3` | "¿Vive usted con un bebé menor de 3 años?" | Botón: Sí / No |
