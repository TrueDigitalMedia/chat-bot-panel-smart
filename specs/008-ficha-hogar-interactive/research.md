# Phase 0 Research: Ficha Hogar interactiva (Fase 4)

## R1: Fase 4 hoy no tiene ninguna interactividad — hay que darle la arquitectura de Fase 1

- **Finding**: `handlePhase3Success` (en `phase-3.ts`) llama a `handlePhase4` **de forma síncrona**, en el mismo instante en que el usuario confirma su registro (`registration-choice.ts`, callback `register:yes`). `handlePhase4` genera el resumen AI y persiste en Treinta inmediatamente — nunca espera ni procesa un mensaje del usuario. No existe ninguna rama en `flow-router.ts` para `leadStatus === 'code_delivered_registered'` porque, hasta ahora, ese estado dura solo el instante entre la confirmación de registro y la persistencia final.
- **Decision**: Convertir Fase 4 en un flujo de múltiples turnos, con la misma forma arquitectónica que Fase 1: (a) una tabla nueva `ficha_hogar_profiles` con su propio `question_index`, (b) una función `handleFichaHogar(lead, messageText, callbackData, correlationId)` que sirve tanto de punto de entrada (enviar la pregunta 1) como de continuación (procesar cada respuesta subsecuente) — exactamente el mismo patrón dual que ya usa `handlePhase1`, y (c) una rama nueva en `flow-router.ts` para `status === 'code_delivered_registered'` que rutea cualquier mensaje entrante a esa función.
- **Rationale**: Es la única forma de cumplir FR-001 a FR-003 (7 preguntas conversacionales, en orden, con gate de descarte) — el código actual literalmente no tiene dónde "esperar" una respuesta del usuario en Fase 4.
- **Alternatives considered**: Ninguna — no hay una forma más simple de agregar interactividad real a un flujo que hoy es 100% síncrono.

## R2: Nuevo estado terminal — cambios al enum y a la máquina de estados

- **Decision**: Se agrega `'ficha_hogar_descartado'` a `LeadStatus` (`types/lead.ts`) y a `leadStatusEnum` (`schema.ts`, requiere migración de tipo Postgres enum). En `transitions.ts`: `code_delivered_registered` gana `'ficha_hogar_descartado'` como destino válido (además del ya existente `'ficha_hogar_completada'`), y `ficha_hogar_descartado: new Set([])` (terminal — `isTerminal()` ya lo calcula automáticamente por tener el set vacío, sin necesitar cambios en esa función).
- **Rationale**: Coincide exactamente con la Assumption del spec ("mismo patrón de estados terminales dedicados que ya usa la máquina de estados"). Modificar un enum de Postgres requiere `ALTER TYPE ... ADD VALUE`, que **no puede ejecutarse dentro de una transacción** en versiones de Postgres anteriores a la 12 — Neon corre Postgres 15+, así que es seguro, pero se documenta como nota operativa para quien aplique la migración manualmente.

## R3: Corrección de respuestas — módulo paralelo, no una generalización de `correction.ts`

- **Finding**: El sistema de corrección existente (`correction.ts`, `correction-fields.ts`) está construido específicamente sobre `SURVEY_FIELDS`/`SurveyProfile` (la tabla de Fase 1) — `showCorrectionMenu`, `FIELD_LABELS`, `questionIndexForField`, etc. todos asumen esa tabla y ese array. Generalizarlo para funcionar con cualquier tabla/conjunto de campos sería un refactor mayor, no una adición.
- **Decision**: Crear `ficha-hogar-correction.ts`, un módulo pequeño y autocontenido que reimplementa el mismo patrón de UX (menú de campos ya respondidos → elegir uno → re-preguntar → continuar) pero acotado a los 7 campos de `FichaHogarProfile`, con su propio prefijo de callback (`correctfh:`) para no colisionar con `correct:` de Fase 1.
- **Rationale**: Cumple FR-005 ("consistente con el mecanismo... de Fase 1", no dice "el mismo código") sin pagar el costo de refactorizar un sistema compartido usado activamente por Fase 1 en producción. Duplicar el patrón (no la lógica interna) es la opción de menor riesgo — Principio III favorece la alternativa más simple cuando ambas cumplen el requisito.
- **Alternatives considered**: Generalizar `correction.ts` con un parámetro de tabla/campos — rechazado por alcance desproporcionado frente al beneficio (evitar ~80 líneas de código similar) y por el riesgo de introducir una regresión en el flujo de corrección de Fase 1, que ya está en producción.

## R4: Fecha de nacimiento — texto validado, no una columna `date` de SQL

- **Finding**: El schema actual no tiene ninguna columna de tipo `date` (solo `timestamp with time zone` en todos lados) — no hay precedente en este código para ese tipo.
- **Decision**: `ficha_hogar_profiles.date_of_birth` se guarda como `varchar(10)` con el string ya validado en formato `DD/MM/AAAA` (la extracción vía IA normaliza el texto libre del usuario a ese formato; una validación adicional de plausibilidad — no ser fecha futura, estar en un rango de edad razonable — se aplica antes de guardar, igual que el spec pide).
- **Rationale**: Coincide literalmente con la Assumption del spec ("se captura como texto libre... y solo se valida por plausibilidad") y mantiene consistencia con el resto del schema (sin introducir un tipo de columna nuevo para un solo campo).
- **Alternatives considered**: Columna `date` real con parseo a `Date` — rechazado; no hay necesidad funcional de operar sobre esta fecha como fecha real (no se usa en cálculos, solo se muestra/persiste), así que el tipo más simple que ya usa el codebase (texto) es suficiente.

## R5: Mensaje de descarte — se reusa `EXIT_A`, no se inventa copy nuevo

- **Decision**: Al descartar por conflicto de interés, se envía `EXIT_A` (el mismo mensaje que D1/D2 ya usan: "Lo sentimos... no te preocupes que tus datos están seguros... Gracias por tu interés").
- **Rationale**: `EXIT_A`'s texto ya es genérico ("si no aplicas esta vez, no te preocupes: no los usaremos ni guardaremos") y encaja perfectamente con el escenario de descarte por conflicto de interés — no hay necesidad de redactar un mensaje nuevo cuando uno ya aprobado y en producción cubre el caso.
- **Alternatives considered**: Redactar un mensaje específico de conflicto de interés — rechazado; el spec no pide una redacción particular, y minimizar mensajes nuevos sin aprobación de negocio reduce riesgo.

## R6: Datos de salud en el resumen de IA — no es un gap de consentimiento nuevo

- **Finding**: La constitución exige "justificación documentada" para pasar PII a proveedores de LLM externos. `handlePhase4` ya envía el perfil completo de Fase 1 (nombre, email, ubicación) al modelo para generar el resumen — este comportamiento es preexistente, no parte de esta feature. Esta feature agrega la condición de salud permanente y la fecha de nacimiento al mismo pipeline de resumen (US3).
- **Decision**: Se documenta explícitamente que la aceptación de T&C en D1 ("Confirma que has leído y aceptas los Términos y Condiciones") es la justificación ya vigente para todo el perfil que fluye hacia el resumen de IA, y que agregar campos de Ficha Hogar a ese mismo pipeline ya consentido no abre una categoría de riesgo nueva — es aditivo a un flujo de datos ya aprobado, no una integración nueva sin justificación.
- **Rationale**: Cumple el Principio I de la constitución mediante documentación explícita en vez de dejarlo implícito, dado que "condición de salud" es una categoría de dato sensible que amerita mención aunque no cambie la conclusión.

## R7: Sin soporte de FAQ digression en Ficha Hogar

- **Decision**: La nueva rama de `flow-router.ts` para `code_delivered_registered` rutea todo mensaje directamente a `handleFichaHogar`, sin el chequeo de FAQ (`findFaq`/`handleOutOfFlow`) que sí existe en la rama de Fase 1.
- **Rationale**: Fase 4 nunca tuvo soporte de FAQ (no había ninguna interactividad antes de esta feature), y el spec no lo pide. Igualar la complejidad de la rama de Fase 1 sin un requisito que lo sostenga violaría YAGNI.
- **Alternatives considered**: Agregar FAQ digression "ya que estamos" — rechazado, alcance no solicitado.

## Resumen de unknowns resueltos

Ningún ítem de "Technical Context" quedó como `NEEDS CLARIFICATION`. El hallazgo más importante es R1: el spec.md original no dejaba explícito que Fase 4 hoy es 100% síncrona sin ningún punto de espera — eso determina que esta feature es arquitectónicamente más parecida a "construir una mini Fase 1" que a "agregar 7 preguntas a un formulario existente".
