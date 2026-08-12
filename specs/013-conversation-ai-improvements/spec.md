# Feature Specification: Mejoras de conversación e IA (apertura, corrección, elegibilidad)

**Feature Branch**: `013-conversation-ai-improvements`

**Created**: 2026-08-12

**Status**: Implemented (documentado retroactivamente — ver nota abajo)

**Input**: Serie de ajustes solicitados directamente en conversación (sin Excel/spec previo), a partir de transcripciones reales de la conversación del bot: (1) combinar el saludo y la pregunta de opt-in en un solo mensaje; (2) agregar una palabra clave ("agente") para derivar a soporte humano; (3) estandarizar cómo el bot interpreta respuestas de texto libre a preguntas de botón, y qué dice cuando no logra entender; (4) permitir que el usuario pida corregir una respuesta anterior desde cualquier punto de la conversación, no solo mientras responde la encuesta; (5) reconocer números escritos en palabras ("siete") en las preguntas de cantidad; (6) descalificar automáticamente a menores de 18 años.

> **Nota**: A diferencia del resto de `specs/`, esta carpeta se creó **después** de implementar y verificar cada cambio (no antes, como plan). Se documenta así para que quede una referencia central de las decisiones tomadas, siguiendo el mismo formato que el resto del proyecto. El detalle de "por qué se decidió así" está en `research.md`.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Apertura combinada + handoff a agente humano (Priority: P1)

Como candidato a panelista, recibo el saludo y la pregunta de opt-in como un solo mensaje con botones (no dos mensajes seguidos), y en cualquier momento de la conversación puedo escribir "agente" para que me deriven con el equipo de soporte, incluso si lo escribo con errores de tipeo.

**Acceptance Scenarios**:

1. **Given** un usuario que inicia una conversación nueva, **When** el bot responde por primera vez, **Then** recibe un único mensaje con el saludo + la pregunta de opt-in + los botones "Inscribirme"/"No".
2. **Given** un usuario en cualquier punto de la conversación, **When** escribe "agente" (exacto o con un typo cercano, ej. "agende"), **Then** el bot responde con el correo de contacto de soporte, sin cambiar el estado ni la fase del lead.
3. **Given** un lead que calificó y va a recibir el mensaje de descarga de la app, **When** se envía ese mensaje, **Then** incluye el aviso de "escribime agente" integrado en el mismo mensaje (no por separado), sin mostrar el correo de soporte hasta que el usuario lo pida.

### User Story 2 - Interpretación por IA de respuestas de botón + mensaje de reintento estandarizado (Priority: P1)

Como candidato a panelista, si respondo una pregunta de botón con texto libre en vez de tocar un botón, el bot intenta entender qué quise decir (no solo para preguntas de Sí/No) antes de repetir la pregunta; y si de verdad no logra entenderme, siempre me avisa de la misma forma antes de volver a preguntar.

**Acceptance Scenarios**:

1. **Given** una pregunta de botón con 3 o más opciones (ej. género, autos, frecuencia de compra), **When** el usuario responde con texto libre que no calza exactamente con ningún botón, **Then** el bot intenta interpretar la respuesta por IA antes de darla por no entendida.
2. **Given** cualquier pregunta (de botón o de texto libre) donde ni el match de botón, ni la IA, ni una respuesta de FAQ resuelven el mensaje del usuario, **When** el bot reenvía la pregunta, **Then** antepone el mismo mensaje estandarizado: "No entendí lo que respondiste 🤔. Te vuelvo a preguntar:".
3. **Given** un usuario que hace una pregunta genuina en vez de responder (ej. "¿para qué necesitan esto?"), **When** el bot la reconoce como una pregunta respondible por FAQ, **Then** la responde y vuelve a mostrar la pregunta pendiente, sin el mensaje de "no entendí".

### User Story 3 - Corrección de una respuesta anterior desde cualquier punto (Priority: P1)

Como candidato a panelista, puedo pedir corregir una respuesta que ya di en cualquier momento de la conversación — incluso mientras el bot me pide el teléfono o la ubicación GPS — y no solo mientras estoy respondiendo la encuesta. Al corregir, retomo exactamente en la pregunta donde estaba, sin tener que volver a responder todo lo que ya había contestado después.

**Acceptance Scenarios**:

1. **Given** un usuario que ya respondió su nombre y ahora está en el gate de ubicación GPS, **When** escribe algo como "quiero corregir mi nombre, lo escribí mal", **Then** el bot reconoce el pedido (aunque la redacción no sea exacta), corrige el campo, y vuelve a entrar al gate de GPS donde estaba — sin repetir preguntas ya contestadas.
2. **Given** un usuario que pide corregir un dato que el sistema no maneja como campo corregible (ej. su número de teléfono), **When** el bot procesa el pedido, **Then** responde explícitamente que no puede corregir eso por ese medio, en vez de ignorarlo o responder algo no relacionado.
3. **Given** un usuario a mitad de una pregunta geográfica (departamento/municipio) que en realidad quiere corregir el país elegido antes, **When** escribe el pedido con redacción libre (ej. "seleccioné mal el país, puedo corregirlo"), **Then** el bot lo reconoce como un pedido de corrección en vez de tratarlo como una respuesta inválida a la pregunta geográfica.

### User Story 4 - Números escritos en palabras (Priority: P2)

Como candidato a panelista, si respondo con el número en palabras ("siete", "somos ocho") a una pregunta de cantidad (personas del hogar, habitaciones), el bot lo entiende y guarda el número correcto, igual que si hubiera tocado un botón o escrito el dígito.

**Acceptance Scenarios**:

1. **Given** la pregunta de cantidad de personas u habitaciones, **When** el usuario responde con el número en palabras o dentro de una frase ("somos ocho"), **Then** el bot extrae el número correcto y lo guarda como entero en la base de datos.

### User Story 5 - Elegibilidad por edad mínima (Priority: P1)

Como equipo de reclutamiento, necesito que ningún menor de 18 años pueda completar el registro como panelista.

**Acceptance Scenarios**:

1. **Given** un usuario que responde la pregunta de edad con un valor menor a 18, **When** el bot procesa la respuesta, **Then** el lead se transiciona a `not_qualified` (razón `age_minor`) y recibe el mismo mensaje de salida que un rechazo de D1/D2, sin avanzar a la siguiente pregunta.
2. **Given** un usuario que ya había respondido una edad válida (18+) y luego la corrige a un valor menor a 18, **When** el bot procesa la corrección, **Then** se aplica la misma descalificación, no solo en la primera respuesta.

## Requirements *(mandatory)*

- **FR-001**: El mensaje de apertura de Fase 1 DEBE combinar saludo y pregunta de opt-in en un único mensaje con botones, enviado una sola vez por lead.
- **FR-002**: El sistema DEBE reconocer la palabra clave "agente" (exacta o con errores de tipeo cercanos, verificados por IA) desde cualquier estado/fase del lead, y responder con los datos de contacto de soporte sin alterar el estado del lead.
- **FR-003**: Toda pregunta de botón (Fase 1 y Ficha Hogar) DEBE intentar interpretar por IA una respuesta de texto libre que no calce con ningún botón, antes de tratarla como no entendida.
- **FR-004**: Cuando ninguna interpretación (match de botón, IA, FAQ) resuelve la respuesta del usuario a una pregunta (de botón o de texto libre), el sistema DEBE enviar el mismo mensaje estandarizado antes de reenviar la pregunta.
- **FR-005**: El sistema DEBE poder detectar un pedido de corrección de una respuesta anterior con redacción libre (no solo frases exactas), incluyendo dentro de los pasos de captura de teléfono y GPS.
- **FR-006**: Al aplicar una corrección de un campo anterior al punto actual de la conversación, el sistema DEBE reanudar exactamente en la pregunta donde estaba el usuario, sin re-solicitar preguntas ya respondidas que no dependían del campo corregido.
- **FR-007**: Un pedido de corrección sobre un dato que el sistema no soporta como campo corregible DEBE recibir un mensaje explícito, no una respuesta genérica o silencio.
- **FR-008**: Las preguntas de cantidad (personas del hogar, habitaciones) DEBEN aceptar el número escrito en palabras o dentro de una frase, no solo dígitos.
- **FR-009**: El sistema DEBE descalificar (`not_qualified`) a cualquier lead cuya edad sea menor a 18 años, tanto en la primera respuesta como en una corrección posterior.

## Success Criteria *(mandatory)*

- **SC-001**: Ningún lead menor de 18 años alcanza un estado calificado (`link_sent` o posterior) — verificable consultando `survey_profiles.age` de todos los leads con `lead_status` distinto de `not_qualified`.
- **SC-002**: Un pedido de corrección con redacción libre, hecho durante los gates de teléfono/GPS o durante la encuesta, es reconocido y aplicado sin necesidad de reiniciar la conversación.
- **SC-003**: Ningún usuario recibe el mensaje "no entendí" con una redacción distinta a la estandarizada, en ninguna pregunta de botón o texto libre.

## Assumptions

- El umbral de 18 años se asume aplicable a todos los países donde opera PanelSmart (Guatemala, Honduras, El Salvador, Nicaragua, Costa Rica, Panamá, República Dominicana); no se investigó si algún país tiene una edad de mayoría distinta.
- La palabra clave de handoff ("agente") es fija; no se investigó si el negocio quiere otras palabras clave equivalentes (ej. "humano", "soporte").
