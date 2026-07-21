# Feature Specification: Chat web (nuevo canal)

**Feature Branch**: `012-web-chat-channel`

**Created**: 2026-07-21

**Status**: Draft

**Input**: User description: "quiero habilitar una pagina que me permita interactuar con el chatbot, sea un chat web. se puede usar https://chat-sdk.dev"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Conversar con el bot desde una página web pública (Priority: P1)

Como visitante que no tiene o no quiere usar Telegram ni WhatsApp, quiero abrir una página web y conversar directamente con el bot de PanelSmart, para completar el mismo proceso de calificación como panelista que ya existe en los otros canales.

**Why this priority**: Es el propósito central de la feature — sin esto no hay canal web. Además abre el reclutamiento a personas sin Telegram/WhatsApp instalado, ampliando el alcance del reclutamiento.

**Independent Test**: Se puede probar de forma aislada abriendo la página web sin ninguna cuenta ni instalación previa, y verificando que el bot responde con el mismo mensaje de bienvenida/opt-in que hoy se envía por Telegram al iniciar una conversación.

**Acceptance Scenarios**:

1. **Given** un visitante nuevo que abre la página del chat web por primera vez, **When** la página carga, **Then** el bot inicia la conversación con el mismo saludo/opt-in que un usuario nuevo de Telegram o WhatsApp.
2. **Given** un visitante en medio de la encuesta de calificación en el chat web, **When** responde una pregunta, **Then** el bot avanza a la siguiente pregunta igual que en los otros canales, respetando el mismo orden y las mismas validaciones.
3. **Given** un visitante que completa la encuesta y hay cupo disponible para su perfil, **When** termina la última pregunta, **Then** recibe en el chat web el mismo resultado (calificado / no calificado / cupo agotado) y, si calificó, las mismas instrucciones/enlace para continuar en la app PanelSmart que recibiría por Telegram o WhatsApp.

---

### User Story 2 - Continuar la conversación al recargar o volver a la página (Priority: P1)

Como visitante que cerró la pestaña o recargó la página en medio de la encuesta, quiero que el chat web recuerde en qué pregunta iba, para no tener que empezar de nuevo.

**Why this priority**: Sin esto, cualquier recarga accidental de página pierde el progreso del visitante — a diferencia de Telegram/WhatsApp, donde la conversación vive en la app de mensajería y sobrevive a cualquier interrupción. Es la brecha de continuidad más importante de mover la conversación a un navegador.

**Independent Test**: Se puede probar iniciando la encuesta, respondiendo un par de preguntas, recargando la página, y verificando que el bot continúa desde la siguiente pregunta pendiente en vez de reiniciar el opt-in.

**Acceptance Scenarios**:

1. **Given** un visitante que ya respondió varias preguntas de la encuesta, **When** recarga la página en el mismo navegador, **Then** el chat muestra el historial de la conversación hasta ese punto y el bot espera la siguiente respuesta pendiente, sin reiniciar la encuesta.
2. **Given** un visitante que cierra la pestaña y vuelve a abrir la página días después desde el mismo navegador, **When** la página carga, **Then** el chat continúa la misma conversación en el mismo punto donde quedó — la sesión persiste indefinidamente mientras el visitante no borre las cookies/datos de ese navegador, igual que una conversación de Telegram o WhatsApp nunca "expira" por sí sola.

---

### User Story 3 - Compartir ubicación durante la encuesta en el chat web (Priority: P2)

Como visitante que llega al punto de la encuesta donde se requiere mi ubicación (para determinar mi región y nivel socioeconómico), quiero poder compartirla desde el navegador, para que el bot pueda continuar evaluando mi elegibilidad igual que en Telegram/WhatsApp.

**Why this priority**: El gate de ubicación es una parte crítica del flujo de calificación actual (determina la región NSE del lead). Sin un equivalente en el chat web, ningún visitante web podría completar la encuesta — por eso es P2 y no P1: US1/US2 ya entregan valor (el chat funciona) aunque este punto específico quede pendiente de definir su mecanismo exacto.

**Independent Test**: Se puede probar llegando al punto de la encuesta que hoy pide "compartir ubicación" en Telegram, y verificando que el chat web ofrece una forma equivalente de proporcionar esa ubicación (o una alternativa) y que el bot la procesa igual que hoy procesa la ubicación de Telegram/WhatsApp.

**Acceptance Scenarios**:

1. **Given** un visitante que llega al paso de ubicación en el chat web, **When** el bot lo solicita, **Then** el chat pide el permiso de ubicación del navegador (el mismo tipo de prompt nativo que usan mapas o apps web) y, si el visitante lo otorga, el bot continúa la encuesta con esa ubicación igual que hoy procesa el GPS compartido por Telegram/WhatsApp.
2. **Given** un visitante que niega el permiso de ubicación del navegador, **When** eso ocurre, **Then** el chat le ofrece la misma alternativa manual (departamento/municipio) que ya existe hoy para cuando un usuario de Telegram no comparte su ubicación.

---

### User Story 4 - Ver conversaciones del canal web en el panel admin (Priority: P3)

Como administrador de Kantar, quiero ver las conversaciones del chat web mezcladas con las de Telegram y WhatsApp en el panel de conversaciones y en el dashboard, identificando claramente cuáles vinieron del canal web, para tener una vista unificada del reclutamiento sin importar el canal.

**Why this priority**: Es una consecuencia natural de agregar un canal nuevo al sistema existente (que ya reporta por canal), no requiere trabajo nuevo de UI compleja — por eso es la prioridad más baja.

**Independent Test**: Se puede probar completando una conversación de prueba en el chat web y verificando que aparece en `/admin/conversations` y en los filtros por canal del dashboard con el valor "web".

**Acceptance Scenarios**:

1. **Given** una conversación completada en el chat web, **When** un administrador abre el panel de conversaciones, **Then** la conversación aparece en la lista con el canal identificado como "web", igual que las de Telegram/WhatsApp.
2. **Given** el dashboard de leads con el filtro de canal, **When** el administrador filtra por canal "web", **Then** ve únicamente las métricas de los leads que llegaron por el chat web.

---

### Edge Cases

- ¿Qué pasa si el visitante abre el chat web en dos pestañas o dos navegadores distintos al mismo tiempo? Cada sesión de navegador se trata como una conversación independiente (mismo comportamiento que hoy tendría un usuario que escribe al bot desde dos números de WhatsApp distintos).
- ¿Qué pasa si el visitante borra las cookies o datos del navegador en medio de la encuesta? Pierde la identidad de su sesión y el chat lo trata como un visitante nuevo (mismo riesgo que existe hoy si alguien cambia de número de teléfono a mitad de una conversación de WhatsApp).
- ¿Qué pasa si el visitante ya completó la encuesta por Telegram o WhatsApp y luego abre el chat web? Se trata como una conversación nueva e independiente — no hay hoy un mecanismo de identidad compartida entre canales para un mismo panelista.
- ¿Qué pasa si múltiples visitantes abren el chat web al mismo tiempo (picos de tráfico, por ejemplo tras una campaña de difusión)? El sistema debe soportar conversaciones concurrentes igual que hoy soporta múltiples conversaciones simultáneas de Telegram/WhatsApp.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: El sistema DEBE exponer una página web pública donde cualquier visitante puede iniciar una conversación de chat con el bot, sin requerir instalar Telegram ni WhatsApp.
- **FR-002**: El chat web DEBE reproducir el mismo flujo conversacional que ya existe en Telegram y WhatsApp (opt-in inicial, puntos de decisión D1/D2/D3, encuesta de calificación, verificación de cupo, resultado final), sin duplicar esa lógica de negocio.
- **FR-003**: El sistema DEBE identificar cada visitante del chat web con una sesión propia, de forma que sus respuestas se asocien de manera consistente a la misma conversación mientras usa el mismo navegador.
- **FR-004**: El chat web DEBE permitir a un visitante continuar su conversación desde donde la dejó al recargar la página o reabrirla en el mismo navegador, sin reiniciar la encuesta.
- **FR-005**: El chat web DEBE mostrar el historial de mensajes de la conversación (los que envió el bot y los que envió el visitante) de forma visible en la página, similar a una interfaz de mensajería.
- **FR-006**: El sistema DEBE soportar en el chat web los mismos tipos de interacción que la encuesta requiere hoy: preguntas de texto libre, preguntas de opción con botones, y el paso de captura de ubicación mediante el permiso de geolocalización del navegador, con la misma alternativa manual (departamento/municipio) ya disponible hoy cuando un visitante no otorga o no tiene ese permiso.
- **FR-006a**: La sesión de un visitante del chat web DEBE persistir indefinidamente en el mismo navegador (sin expiración automática) mientras no borre sus cookies/datos, igual que una conversación de Telegram o WhatsApp no expira por sí sola.
- **FR-007**: Cuando un visitante del chat web califica como panelista, el sistema DEBE entregarle las mismas instrucciones/enlace de registro en la app PanelSmart que recibe hoy un lead calificado de Telegram o WhatsApp.
- **FR-008**: Las conversaciones y leads originados en el chat web DEBEN quedar registrados con el canal "web", visibles junto a los de Telegram y WhatsApp en el panel administrativo de conversaciones y en el dashboard de leads existentes, sin requerir una vista separada.
- **FR-009**: El sistema DEBE seguir aplicando las mismas reglas de negocio ya vigentes (scoring NSE, cuotas flexibles por dimensión, excepción de embarazo/bebé) a los leads que llegan por el chat web, sin ninguna excepción por canal.

### Key Entities *(include if feature involves data)*

- **Sesión de chat web**: identifica de forma persistente a un visitante anónimo en su navegador, para que sus mensajes se asocien siempre al mismo lead mientras dure la sesión. Es el equivalente, para el canal web, del `chat_id` de Telegram o el número de teléfono de WhatsApp.
- **Lead / conversación** (ya existentes): sin cambios de estructura — el canal web es un valor más del canal ya soportado por estas entidades.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Un visitante nuevo puede iniciar una conversación en el chat web y llegar a la primera pregunta de la encuesta sin ninguna instalación ni cuenta previa, en menos de 10 segundos desde que abre la página.
- **SC-002**: El 100% de las preguntas y reglas de calificación disponibles hoy en Telegram/WhatsApp están disponibles también en el chat web, sin preguntas faltantes ni reglas de negocio distintas por canal.
- **SC-003**: Un visitante que recarga la página en medio de la encuesta retoma la conversación exactamente en la pregunta pendiente, sin perder respuestas ya dadas, en el 100% de los casos dentro del período de persistencia de sesión definido.
- **SC-004**: Los leads y conversaciones del canal web son visibles y filtrables en el panel administrativo existente sin necesidad de herramientas o vistas adicionales.
- **SC-005**: El sistema mantiene conversaciones de chat web simultáneas de múltiples visitantes sin mezclar ni perder mensajes entre sesiones distintas.

## Assumptions

- El chat web reproduce el mismo bot de reclutamiento que ya existe (mismas preguntas, mismo scoring, mismas cuotas) — no es un asistente conversacional nuevo ni de propósito distinto; solo agrega un canal de acceso adicional al bot actual.
- La página del chat web es pública y de acceso libre, igual que hoy cualquiera puede escribirle al bot de Telegram o al número de WhatsApp sin invitación previa.
- No se requiere que un visitante inicie sesión con cuenta ni correo para chatear — la identidad de la sesión se maneja de forma anónima por navegador y persiste indefinidamente mientras no se borren las cookies/datos de ese navegador (mismo comportamiento sin expiración que Telegram/WhatsApp).
- El diseño visual/UX de la página de chat (branding, colores, disposición) no está definido en este spec — se resuelve en la fase de diseño/planning, siempre que cumpla la función conversacional descrita aquí.
- Esta feature no introduce un mecanismo para que un mismo panelista vincule su conversación de chat web con una conversación previa de Telegram o WhatsApp — cada canal permanece independiente, igual que Telegram y WhatsApp lo son hoy entre sí.
