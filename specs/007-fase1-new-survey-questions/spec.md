# Feature Specification: Nuevas preguntas de Fase 1 (opt-in, edad, embarazo, bebé)

**Feature Branch**: `007-fase1-new-survey-questions`

**Created**: 2026-07-17

**Status**: Draft

**Input**: User description: "Agregar las 4 preguntas nuevas de Fase 1 definidas en el Excel oficial actualizado de Kantar CAM que hoy no están implementadas: #1 opt-in inicial ('¿Te gustaría inscribirte en PanelSmart y comenzar a ganar premios?'), #12 edad, #17 ¿embarazada?, #18 ¿bebé menor de 3 años?. Las tres últimas son cuotas extra y no afectan el cálculo de NSE. Ver docs/WIKI.md sección 5 y 7.4."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Pregunta de opt-in inicial (Priority: P1)

Como candidato a panelista, lo primero que veo al iniciar la conversación es una pregunta de opt-in ("¿Te gustaría inscribirte en PanelSmart y comenzar a ganar premios?"), para decidir desde el inicio si quiero continuar antes de pasar por la aceptación de términos y condiciones.

**Why this priority**: Es un nuevo punto de decisión (equivalente a D1/D2) que cambia el inicio del flujo; su ausencia hace que el bot no siga el guion oficial actualizado desde el primer mensaje.

**Independent Test**: Se puede probar iniciando una conversación nueva y verificando que la primera pregunta mostrada es el opt-in, antes de la pregunta de T&C.

**Acceptance Scenarios**:

1. **Given** un usuario que inicia una conversación nueva, **When** el bot responde, **Then** la primera pregunta es el opt-in de inscripción, antes de la pregunta de T&C (D1).
2. **Given** un usuario que responde "No" al opt-in, **When** el bot procesa la respuesta, **Then** el lead se transiciona a `not_qualified` y no se le presentan más preguntas de Fase 1.
3. **Given** un usuario que responde "Inscribirme" al opt-in, **When** el bot procesa la respuesta, **Then** el flujo continúa normalmente hacia la pregunta de T&C (D1).

---

### User Story 2 - Captura de edad (Priority: P2)

Como encuestador, quiero capturar la edad del panelista (en años cumplidos) como parte de la encuesta, para poder usarla como criterio de cuota adicional sin que afecte el cálculo de nivel socioeconómico (NSE).

**Why this priority**: Es una pregunta de cuota adicional requerida por el Excel oficial; no bloquea el cálculo de NSE pero sí es necesaria para el guion completo y para futuras segmentaciones por edad.

**Independent Test**: Se puede probar completando la encuesta con una edad válida y verificando que (a) la respuesta queda almacenada en el perfil del panelista y (b) el score SCL calculado no cambia si se varía solo la edad manteniendo el resto de respuestas constante.

**Acceptance Scenarios**:

1. **Given** el flujo de encuesta después de la pregunta de género, **When** se llega a la pregunta de edad, **Then** el bot solicita los años cumplidos como texto/número libre.
2. **Given** una edad numérica válida, **When** el usuario responde, **Then** el sistema almacena la edad en el perfil de la encuesta y continúa con la siguiente pregunta.
3. **Given** dos encuestas idénticas salvo por la edad reportada, **When** se calcula el score SCL de ambas, **Then** el score es idéntico en ambos casos.

---

### User Story 3 - Pregunta de embarazo (Priority: P2)

Como encuestador, quiero preguntar si la persona encuestada está actualmente embarazada, para fines de cuota adicional, sin que la respuesta afecte el cálculo de NSE.

**Why this priority**: Igual que la edad, es una pregunta de cuota adicional del guion oficial, de menor urgencia que el opt-in pero necesaria para completar el flujo actualizado.

**Independent Test**: Se puede probar completando la encuesta y verificando que la respuesta Sí/No a la pregunta de embarazo queda almacenada y no participa en el cálculo del score SCL.

**Acceptance Scenarios**:

1. **Given** el flujo de encuesta en el punto correspondiente, **When** se llega a la pregunta de embarazo, **Then** el bot presenta las opciones Sí/No.
2. **Given** una respuesta a la pregunta de embarazo, **When** se calcula el score SCL, **Then** el resultado no varía según la respuesta dada.

---

### User Story 4 - Pregunta de bebé menor de 3 años (Priority: P2)

Como encuestador, quiero preguntar si el panelista vive con un bebé menor de 3 años, para fines de cuota adicional, sin que la respuesta afecte el cálculo de NSE.

**Why this priority**: Misma naturaleza y urgencia que la pregunta de embarazo; ambas se agrupan como preguntas de cuota extra del mismo bloque del Excel oficial.

**Independent Test**: Se puede probar completando la encuesta y verificando que la respuesta Sí/No queda almacenada y no participa en el cálculo del score SCL.

**Acceptance Scenarios**:

1. **Given** el flujo de encuesta en el punto correspondiente, **When** se llega a la pregunta de bebé menor de 3 años, **Then** el bot presenta las opciones Sí/No.
2. **Given** una respuesta a esta pregunta, **When** se calcula el score SCL, **Then** el resultado no varía según la respuesta dada.

---

### Edge Cases

- ¿Qué ocurre si el usuario ingresa una edad no numérica o fuera de un rango plausible (p. ej. "abc", "3", "200")? El bot debe re-solicitar la respuesta usando el mismo patrón de validación que otras preguntas numéricas de la encuesta.
- ¿Qué ocurre si el usuario decide corregir una respuesta anterior de edad, embarazo o bebé usando el mecanismo de corrección existente? Debe funcionar igual que para las demás preguntas de la encuesta.
- ¿Qué ocurre si el usuario responde "No" al opt-in después de haber avanzado ya en una conversación previa (reingreso)? Debe tratarse igual que un rechazo en D1/D2, cerrando el lead como `not_qualified`.
- ¿Aplican estas preguntas igual en Telegram y WhatsApp? Sí, deben comportarse de forma consistente en ambos canales.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: El sistema DEBE presentar la pregunta de opt-in ("¿Te gustaría inscribirte en PanelSmart y comenzar a ganar premios?") como la primera interacción de la Fase 1, antes del punto de decisión de T&C (D1).
- **FR-002**: Si el usuario rechaza la pregunta de opt-in, el sistema DEBE transicionar el lead a estado `not_qualified`, de forma consistente con el comportamiento de D1/D2.
- **FR-003**: El sistema DEBE preguntar la edad del encuestado (numérica, texto libre) después de la pregunta de género, almacenándola en el perfil de la encuesta sin usarla en el cálculo del score NSE.
- **FR-004**: El sistema DEBE preguntar si el encuestado está actualmente embarazada (Sí/No), almacenando la respuesta sin usarla en el cálculo del score NSE.
- **FR-005**: El sistema DEBE preguntar si el encuestado vive con un bebé menor de 3 años (Sí/No), almacenando la respuesta sin usarla en el cálculo del score NSE.
- **FR-006**: El sistema DEBE persistir las cuatro respuestas nuevas (opt-in, edad, embarazo, bebé menor de 3 años) en el perfil de la encuesta para uso posterior como criterios de cuota.
- **FR-007**: El sistema DEBE permitir la corrección de estas cuatro respuestas nuevas usando el mecanismo de corrección de respuestas previas ya existente en el flujo.
- **FR-008**: El sistema DEBE presentar estas cuatro preguntas de forma consistente tanto en el canal de Telegram como en el de WhatsApp.

### Key Entities *(include if feature involves data)*

- **SurveyProfile**: perfil de respuestas de la encuesta; se extiende con los campos opt-in, edad, embarazo y bebé menor de 3 años.
- **Lead**: registro del panelista candidato; su estado puede transicionar a `not_qualified` si se rechaza la nueva pregunta de opt-in.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: El 100% de las conversaciones nuevas presentan la pregunta de opt-in antes de cualquier otra pregunta de Fase 1.
- **SC-002**: Los leads que rechazan la pregunta de opt-in quedan marcados como `not_qualified` y no reciben más preguntas de Fase 1, igual que el comportamiento de D1/D2.
- **SC-003**: Las respuestas de edad, embarazo y bebé menor de 3 años quedan capturadas y almacenadas para al menos el 95% de los leads que completan la Fase 1, verificado mediante el perfil de encuesta almacenado de cada lead.
- **SC-004**: El score NSE calculado antes y después de este cambio permanece idéntico para los mismos datos de hogar subyacentes (las respuestas de edad, embarazo y bebé no tienen ningún impacto en el score), verificado mediante prueba de regresión.

## Assumptions

- La validación de edad acepta valores plausibles para un panelista (aproximadamente entre 13 y 100 años); una entrada no numérica o fuera de rango se vuelve a solicitar usando el mismo patrón que otras preguntas numéricas existentes (p. ej. número de personas en el hogar).
- Las cuatro respuestas nuevas se almacenan como campos adicionales filtrables/de cuota en la tabla `survey_profiles` existente; no se requiere integración con ningún sistema externo nuevo.
- El orden de las preguntas sigue la secuencia del Excel oficial: opt-in primero (antes de D1), edad después de género (P12 sigue a P11 en la fuente), y embarazo/bebé menor de 3 años después de la pregunta de personas en el hogar (P17/P18 en la fuente).
