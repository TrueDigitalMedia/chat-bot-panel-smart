# Phase 0 Research: Mejoras de conversación e IA

## R1: El fallback de IA solo se llama como último recurso, nunca en cada turno

- **Finding**: La primera versión de la detección de corrección (`tryHandleCorrectionRequest`) se llamó desde `flow-router.ts` **antes** de intentar resolver el mensaje como respuesta normal a la pregunta pendiente — es decir, en cada turno, para cualquier texto libre, incluidas respuestas normales de encuesta ("Guatemala", "5", nombres, emails). Como la regex barata (`detectCorrectionIntent`) devuelve `'none'` la gran mayoría de las veces, esto habría disparado una llamada de IA (`detectCorrectionIntentAI`) en casi cada turno de texto libre de toda la encuesta — una regresión de costo/latencia significativa, detectada antes de hacer commit.
- **Decision**: Se agregó un parámetro `useAIFallback` a `tryHandleCorrectionRequest`/`tryHandleFichaHogarCorrectionRequest`. El pre-chequeo de `flow-router.ts` (que corre en cada turno, antes de intentar resolver la respuesta) usa `useAIFallback: false` — solo la regex barata. La IA solo se invoca desde los puntos donde la resolución normal de la respuesta **ya falló** (dentro de `phase-1.ts`/`phase-4.ts`, y en las ramas de texto no reconocido de `phone-capture.ts`/`gps-capture.ts`), como último recurso antes de dar el mensaje de "no entendí".
- **Rationale**: Mismo patrón ya usado para `interpretButtonAnswer` (match de texto barato primero, IA solo si falla) y para `mightBeAgenteTypo`/`detectAgentHandoffIntent` (prefiltro de distancia de edición antes de llamar IA). Consistencia de costo en todo el sistema: la IA nunca es el primer intento, siempre el último.
- **Alternatives considered**: Cachear el resultado de la IA por lead/turno — rechazado, no resuelve el problema de fondo (se seguiría llamando en cada turno la primera vez).

## R2: Los archivos que usan `logCall`/`db` no pueden ser importados estáticamente por módulos con tests unitarios puros

- **Finding**: Dos veces durante esta serie de cambios, agregar una función que usa IA (`generateObject` + `logCall`, que importa `@/lib/db/call-log` → `@/lib/db/client` → `neon(process.env.POSTGRES_URL!)`) al mismo archivo que una función pura ya importada estáticamente por un test unitario rompió ese test — el test falla con `No database connection string was provided to neon()`, porque cualquier import (aunque sea de un símbolo distinto) evalúa el módulo completo, incluidos sus imports de nivel superior.
  - Ocurrió con `agent-typo.ts`/`detect-agent-handoff.ts` (el prefiltro puro tuvo que separarse de la función IA) y de nuevo con `detect-correction-intent.ts`/`detect-correction-intent-ai.ts` (mismo patrón, rompiendo `tests/unit/correction-intent.test.ts`).
- **Decision**: Cualquier función de detección con un "prefiltro barato + IA de respaldo" se separa en dos archivos: uno sin dependencias de DB/IA (importable estáticamente por tests y por `flow-router.ts`), y otro que sí las tiene (siempre importado dinámicamente vía `await import(...)` desde los call sites).
- **Rationale**: Es más barato mantener esta separación de forma consistente que descubrir el mismo fallo cada vez que se agrega una función de este tipo.
- **Alternatives considered**: Mockear `@/lib/db/client` globalmente en la config de Vitest — rechazado; oculta el problema real (el módulo de producción sigue acoplado a la DB en su import de nivel superior, solo que los tests dejan de notarlo) en vez de resolverlo.

## R3: El teléfono no se agrega como campo corregible

- **Finding**: `leads.phoneNumber` vive en la tabla `leads`, no en `survey_profiles` — todo el sistema de corrección (`SurveyFieldName`, `FIELD_ALIASES`, `questionIndexForField`, el menú de corrección) está construido exclusivamente alrededor de columnas de `survey_profiles`. Soportar la corrección del teléfono habría requerido generalizar ese tipo o agregar una ruta especial paralela.
- **Decision**: El teléfono queda explícitamente fuera de alcance de este cambio. Cuando el detector de IA identifica que el usuario quiere corregir el teléfono (o cualquier dato fuera del set corregible), el sistema responde con un mensaje explícito ("Por ahora no puedo corregir eso por acá...") en vez de fallar en silencio o dar una respuesta de FAQ no relacionada — que era el bug original reportado por el negocio.
- **Rationale**: Decisión explícita del negocio al revisar el plan — el costo de generalizar el sistema de corrección para incluir campos de `leads` no se justificaba solo para resolver el síntoma reportado (que el usuario recibiera un mensaje coherente, no necesariamente que el teléfono fuera editable ahí mismo).
- **Alternatives considered**: Generalizar `SurveyFieldName` para aceptar también columnas de `leads` — pospuesto; es la ruta natural si el negocio pide soportar la corrección real del teléfono más adelante.

## R4: Reanudación tras corrección reusa columnas de schema existentes, sin migración

- **Finding**: `flow_states.is_correcting` / `correcting_field` / `correction_resume_index` ya existían en el schema (visibles en `src/lib/db/schema.ts`), pero un grep completo del repo mostró que **nunca se leían** — solo se escribían como `false`/`null` en cada punto donde se aplicaba una corrección. El diseño original parece haber anticipado esta funcionalidad sin implementarla.
- **Decision**: `resumeAfterCorrection` (Fase 1, en `correction.ts`) y `resumeFichaHogarAfterCorrection` (Ficha Hogar, en `ficha-hogar-correction.ts`) implementan la lectura real de estas columnas: al corregir un campo anterior al punto actual del usuario, se guarda el índice de reanudación; en cada avance de pregunta posterior, si el campo de esa pregunta ya tiene un valor no nulo (no fue parte del cascade de la corrección), se salta automáticamente sin volver a preguntarla, hasta llegar al índice de reanudación.
- **Rationale**: Cero costo de migración (las columnas ya existen), y reutilizar las mismas 3 columnas para Ficha Hogar es seguro porque un lead nunca está en Fase 1 y Fase 4 al mismo tiempo.
- **Alternatives considered**: Ninguna — la reutilización directa de columnas existentes sin uso es la opción obviamente más barata y no tiene contraindicación conocida.

## R5: `ON CONFLICT DO NOTHING` en el seed de FAQs impedía corregir entradas existentes

- **Finding**: Al agregar/corregir entradas en `data/faqs.json` como parte de esta documentación (edad mínima, cómo corregir una respuesta, cómo hablar con un agente), se detectó que `src/lib/db/seed/faqs.ts` insertaba con `ON CONFLICT (question_hash) DO NOTHING` — como el hash se calcula solo sobre la pregunta, editar la **respuesta** de una entrada ya sembrada y volver a correr el seed no actualizaba nada en la base real; la respuesta vieja quedaba servida indefinidamente por `findFaq`/`answerClarification`.
- **Decision**: Se cambió a `ON CONFLICT (question_hash) DO UPDATE SET answer = excluded.answer, category = excluded.category, embedding = excluded.embedding`, para que editar `data/faqs.json` y re-correr `npm run db:seed:faqs` sí actualice entradas existentes.
- **Rationale**: Bug latente independiente de esta feature, pero descubierto al intentar corregir la entrada "¿Cómo contacto a soporte?" (que quedaba inconsistente con el nuevo flujo de "agente"); corregirlo ahora evita que quede la misma trampa la próxima vez que alguien edite una FAQ existente.
- **Alternatives considered**: Borrar y re-sembrar todo el archivo en cada deploy — rechazado, más lento y pierde el propósito de `ON CONFLICT` como upsert idempotente.

## Nota operacional

Los cambios en `data/faqs.json` **no tienen efecto en producción hasta correr `npm run db:seed:faqs` contra la base real** (Neon) — el archivo JSON es solo la fuente, la tabla `faq_entries` (con sus embeddings) es lo que el bot consulta en tiempo real. Igual que con las migraciones SQL, esto debe ejecutarse en la misma sesión de trabajo donde se edita el archivo, no queda "aplicado" solo por hacer commit.
