# Research: Chat web (nuevo canal)

## R1: Identidad de sesión del visitante anónimo

**Decision**: Cookie propia `web_session_id` (UUID v4), `HttpOnly`, `Secure`, `SameSite=Lax`, `Max-Age` de ~2 años (persistencia indefinida por navegador, spec 012 Q1). El servidor la genera en el primer request si no existe, y a partir de ahí el `channelUserId` del lead **es** ese UUID: `upsertLead('web', webSessionId)`.

**Rationale**: `upsertLead(channel, channelUserId, channelUsername?)` (`src/lib/db/leads.ts:7`) ya es 100% genérico — no distingue si `channelUserId` es un `chat_id` numérico de Telegram, un teléfono de WhatsApp o un UUID de sesión web. Reutilizarlo tal cual evita cualquier cambio de schema o de la lógica de creación de leads. Al ser `HttpOnly`, el navegador la adjunta automáticamente en cada `fetch()` al mismo origen sin que el cliente JS tenga que leerla o gestionarla.

**Alternatives considered**: Requerir login/email antes de chatear — rechazado, contradice el spec (chat público, sin cuenta) y agrega fricción que ningún otro canal tiene hoy. `localStorage` en vez de cookie — rechazado: no viaja automáticamente con `fetch()`, obligaría a leer/enviar el id manualmente en cada request (más código, mismo resultado).

## R2: Cómo llega la respuesta del bot al navegador (sin webhook externo que "empuje")

**Decision**: Procesamiento síncrono. El endpoint `POST /api/chat/web` llama a `routeMessage(...)` con `await` directo (no con `after()` como hacen los webhooks de Telegram/WhatsApp) y, una vez termina, responde en el mismo HTTP response con los mensajes salientes generados durante ese turno.

Esos mensajes salientes **no requieren un nuevo mecanismo de almacenamiento**: `conversation_messages` ya registra cada mensaje saliente de cualquier canal — `logOut()` en `src/lib/messaging/send.ts:16-30` se llama al final de cada función `send*`, sin importar el canal. El endpoint solo necesita capturar el timestamp justo antes de llamar a `routeMessage` y, al terminar, consultar las filas `direction='out'` de ese lead creadas después de ese timestamp.

**Rationale**: Evita construir infraestructura de tiempo real (WebSocket/SSE) para el MVP. El patrón "el visitante envía un mensaje y la misma respuesta HTTP trae la contestación del bot" es exactamente cómo funciona un `POST` de chat típico (incluido el patrón que usa `chat-sdk.dev`) y encaja sin fricción con el modelo serverless de Vercel (sin conexiones persistentes). `conversation_messages` ya es la fuente de verdad para el panel admin — usarla también como el "buzón" del canal web evita una segunda tabla o cola redundante (Principio III).

**Alternatives considered**: WebSocket/SSE dedicado — rechazado para el MVP: ningún escenario del spec (US1–US4) requiere push en tiempo real mientras la pestaña está inactiva; ver R8 sobre re-enganche. Polling periódico del cliente — no descartado a futuro, pero no es necesario para cumplir el spec actual (ver R8); el modelo síncrono ya cubre el 100% de los criterios de aceptación.

## R3: Endpoint de entrada del canal web

**Decision**: Nueva ruta `src/app/api/chat/web/route.ts` (no bajo `/api/webhooks/`, porque no es un receptor pasivo de un proveedor externo — es un endpoint de chat directo con el visitante):

- `GET /api/chat/web` — "bootstrap": lee/crea la cookie de sesión, resuelve/crea el lead vía `upsertLead('web', sessionId)`, y si el lead no tiene mensajes previos (visitante nuevo) dispara el mismo arranque que ya usa el flujo de reinicio — `handlePhase1(lead, '', undefined, correlationId)` (`src/lib/conversation/flow-router.ts:66`, mismo patrón ya probado para "primer contacto"/reinicio). Devuelve el historial completo de `conversation_messages` de ese lead para pintar el chat.
- `POST /api/chat/web` — recibe `{ text?, callbackData?, location? }`, arma un `ChannelInbound` con `channel: 'web'`, registra el mensaje entrante (`logConversationMessage`), llama `routeMessage(lead, inbound, correlationId)` (`src/lib/conversation/flow-router.ts:52`) sin envolver en `after()`, y responde con los mensajes salientes nuevos (ver R2).

**Rationale**: Reutiliza el motor de conversación completo (`routeMessage`, `handlePhase1`, GPS gate, scoring, cuotas, Fase 4) sin tocarlo — el canal web es una nueva "puerta de entrada", no una reimplementación de la lógica de negocio. Mismo rol que cumplen hoy `src/app/api/webhooks/telegram/route.ts` y `.../whatsapp/route.ts`, solo que sin proveedor externo de por medio.

**Alternatives considered**: Reusar la ruta `/api/webhooks/telegram` con un canal falso — rechazado, mezclaría el parseo del payload de Telegram con un formato de request completamente distinto.

## R4: Botones (respuestas de opción múltiple)

**Decision**: El canal web usa el mismo modelo que Telegram — `callback_data` real. `sendInlineKeyboard` ya registra `meta.buttons: [{text, callback_data}]` en `conversation_messages` para todo canal (`src/lib/messaging/send.ts:87-89`); el cliente web pinta esos botones directamente desde ese `meta`, y al hacer clic hace `POST { callbackData }`, que llega a `routeMessage` exactamente como un `callback_query` de Telegram.

**Rationale**: Al ser una UI propia (no una app de mensajería de terceros con límites de formato), no hace falta el workaround de lista numerada que usa WhatsApp (`src/lib/whatsapp/pending-choices.ts`) — eso solo existe porque WhatsApp no tiene botones con payload real. El canal web sí puede tener botones reales, como Telegram.

## R5: Captura de ubicación (GPS)

**Decision**: El cliente web pide el permiso de geolocalización del navegador (`navigator.geolocation.getCurrentPosition`, resuelto en la clarificación del spec) y envía `{ location: { latitude, longitude } }` en el `POST`, mapeando 1:1 al campo `ChannelInbound.location` que ya existe (`src/types/channel.ts:17`) y que `handleGpsCapture`/`reverseGeocode` ya consumen sin distinguir canal (`src/lib/conversation/gps-capture.ts:114`). Si el visitante niega el permiso, el flujo cae en la misma ruta manual (escribir departamento/municipio) que ya existe hoy para cuando alguien no comparte ubicación en Telegram/WhatsApp — sin cambios en `gps-capture.ts`.

**Rationale**: Cero cambios en la lógica de negocio de geolocalización; el "adaptador" web solo tiene que traducir el resultado del navegador al mismo shape que ya entiende el motor.

## R6: Solicitud de teléfono

**Decision**: El canal web sigue la misma rama que ya existe para "no es Telegram" en `sendPhoneRequest` (`src/lib/messaging/send.ts:105-121`) — el prompt ya tiene el texto correcto para pedirlo escrito ("Escríbelo con código de país"); solo se ajusta esa función para que el caso `web` registre el prompt como mensaje saliente (vía `logOut`, igual que los demás) en vez de lanzar el error de "no implementado".

## R7: Adaptador de envío saliente (`send.ts`) para el canal `web`

**Decision**: En cada función de `src/lib/messaging/send.ts` (`sendText`, `sendVideo`, `sendInlineKeyboard`, `sendPhoneRequest`, `confirmPhoneSaved`, `sendLocationRequest`), el caso `'web'` deja de lanzar `Error('...not implemented...')` y simplemente no hace ninguna llamada a un SDK externo — el `switch` cae directo a `logOut()`, que ya persiste el mensaje en `conversation_messages`. `confirmLocationKeyboardRemoved` ya maneja `'web'` correctamente hoy (cae a `sendText`, línea 184-187) — no requiere cambios.

**Rationale**: Es la consecuencia directa de R2 — la "entrega" del mensaje al canal web ya no es una llamada HTTP saliente a un proveedor, es simplemente persistir el mensaje para que el próximo `GET`/respuesta del `POST` lo incluya.

## R8: Re-enganche (QStash) para leads del canal web

**Decision**: Sin cambios en `src/lib/scheduler/re-engagement.ts`. Cuando un job de re-enganche programado se ejecuta para un lead del canal `web`, su llamada a `sendText`/`sendInlineKeyboard` simplemente registra el mensaje en `conversation_messages` (R7) — no hay ninguna forma de "empujarlo" a una pestaña de navegador que pudo haberse cerrado hace días. El visitante lo verá la próxima vez que abra o recargue la página del chat web (mismo comportamiento que "continuar donde quedó", FR-004).

**Rationale**: El spec (spec.md) no pide notificaciones push/email para el canal web, y no existe ningún mecanismo de contacto fuera del navegador para un visitante anónimo. Documentar esto explícitamente evita que quede como un bug silencioso — es una limitación conocida y aceptada del canal, no un vacío de implementación.

**Alternatives considered**: Requerir email al visitante para poder re-engancharlo por correo — fuera de alcance del spec actual (agregaría fricción a un chat que hoy es explícitamente sin cuenta); queda como posible mejora futura, no parte de esta feature.

## R9: Interfaz de usuario del chat — reutilizar patrones de `chat-sdk.dev`, no su backend

**Decision**: Página pública nueva en `src/app/chat/page.tsx` (fuera de `/admin`, no interceptada por `middleware.ts` — su `matcher` solo cubre `/admin/*` y rutas `/api/admin/*`, `/api/conversations/*`, `/api/evals/*`). Se construye con Tailwind CSS (ya es dependencia y es el estándar de estilo declarado en la constitution) y puede tomar como referencia visual/de interacción los componentes de chat de `chat-sdk.dev` (lista de mensajes, burbujas, composer de texto, indicador de "escribiendo") — pero conectados a `POST/GET /api/chat/web` (R3), **no** al backend de referencia de `chat-sdk.dev` (que trae su propio schema de persistencia, autenticación con NextAuth, streaming de modelo, panel de "artifacts", etc.).

**Rationale**: La constitution ya declaraba "Chat SDK (chat-sdk.dev) para conversation state and UI primitives" como parte del stack previsto (v1.0.0, Technology Stack) — pero el motor de conversación de este proyecto (`routeMessage`, la máquina de estados, el scoring NSE, las cuotas) ya existe y es el que debe seguir siendo la única fuente de verdad (Principio III: "Duplicated logic is acceptable over premature generalization" y "New dependencies MUST be evaluated against existing... capabilities first"). Adoptar el backend completo de `chat-sdk.dev` duplicaría esa lógica de negocio en un segundo sistema de persistencia de conversación — exactamente lo que la constitution pide evitar. Tomar solo sus patrones de UI (o instalar únicamente piezas de UI de `@ai-sdk/react` si aplican) sí es compatible.

**Alternatives considered**: Clonar el template completo de `chat-sdk.dev` como app separada — rechazado: requiere reimplementar desde cero todo el flujo de calificación (encuesta, scoring, cuotas) dentro de ese template, lo cual contradice directamente FR-002 del spec ("sin duplicar esa lógica de negocio").

## R10: Rate limiting / abuso

**Decision**: Mismo patrón ya usado en `src/app/api/webhooks/telegram/route.ts:9-25` (mapa en memoria, 20 requests/60s), aplicado en `/api/chat/web` con la cookie de sesión como clave.

**Rationale**: Cumple el Principio I de la constitution ("Rate limiting and abuse detection MUST be applied at the API and session layers") con el mismo mecanismo ya validado en producción para los otros canales — no introduce una dependencia nueva (Redis/KV) para esto.

## Resumen de NEEDS CLARIFICATION resueltos

Ambos se resolvieron en `/speckit-specify` (persistencia de sesión indefinida, captura de GPS vía permiso del navegador) y ya están reflejados en R1 y R5.
