# Tarea: crear plantillas de WhatsApp en Twilio

**Encargo para un agente con acceso a la API de Twilio.** Objetivo único: dar de alta en Twilio (Content API) y someter a aprobación de WhatsApp las plantillas listadas más abajo. No incluye modificar el código de la app (`src/lib/...`) — eso es una tarea de seguimiento, esbozada al final solo para dar contexto de qué sigue.

---

## 0. Verificar esto antes de crear nada

Este repo (`chat-bot-ai`, bot de recruitment PanelSmart) soporta **dos** proveedores de WhatsApp intercambiables via `WHATSAPP_PROVIDER` (`src/lib/whatsapp/provider.ts`): Meta Cloud API directo, o Twilio. En el `.env.local` de desarrollo está en `meta`. Las plantillas que crea esta tarea solo sirven si el número/WABA que efectivamente usa producción es el gestionado por Twilio (`TWILIO_WHATSAPP_FROM`) — si producción sigue mandando por la API directa de Meta con un WABA distinto, estas plantillas quedan huérfanas (aprobadas, pero inalcanzables desde el código actual).

**Antes de crear ninguna plantilla:**
1. Confirmar con quien gestiona el proyecto cuál es el `WHATSAPP_PROVIDER` real en producción (Vercel u otro hosting) y si el número de WhatsApp Business en uso es el mismo que está detrás de `TWILIO_ACCOUNT_SID`/`TWILIO_WHATSAPP_FROM`.
2. Si no se puede confirmar, o si producción resulta estar en `meta`, **detenerse y reportarlo** en vez de crear las plantillas igual — ver `docs/whatsapp-marketing-templates-migration.md` en ese caso, que es la misma tarea pero para WhatsApp Manager (Meta) en lugar de Twilio.
3. Confirmar que las credenciales (`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`) a usar tienen permiso de Content API y de envío de Approval Requests para WhatsApp sobre esa cuenta.

---

## 1. Por qué

El bot nunca envía plantillas — todo sale como texto de sesión libre. Eso es válido siempre que el mensaje sea una respuesta directa a algo que el usuario acaba de escribir/tocar (cae dentro de la ventana de 24h). Una auditoría del inventario completo de mensajes del bot identificó **6 mensajes que se disparan desde jobs programados**, sin un mensaje entrante fresco del usuario en ese turno, y por eso necesitan plantilla aprobada por Meta:

- **27 variantes de re-enganche** (3 pools × 3 intentos × 3 variantes), contenido con lenguaje de incentivo/urgencia → categoría **Marketing**. Disparadas por el job `re-engage` (`src/app/api/jobs/re-engage/route.ts`), 75min/7h/12h tras inactividad.
- **3 mensajes de entrega/estado del código de registro**, contenido de actualización de estado transaccional → categoría **Utility**. Disparados por el job `request_registration_code` (10 min tras entrar a Fase 2, `src/lib/scheduler/constants.ts:1`) o al tocar "Ya la descargué".

Los 27 textos de Marketing ya estaban documentados con más detalle (pensado para Meta WhatsApp Manager) en [`docs/whatsapp-marketing-templates-migration.md`](whatsapp-marketing-templates-migration.md) — este archivo reusa esos mismos textos exactos, verificados contra `src/lib/db/seed/message-variants.ts`, y agrega los 3 de Utility que ese documento no cubría.

**Fuera de alcance / no crear plantilla para esto todavía:** el caption del video de onboarding (`ONBOARDING_VIDEO_URL`, `src/lib/onboarding/deliver-registration-code.ts:43-45`) también se dispara desde el mismo job automático y en teoría necesitaría un HEADER tipo video en su plantilla — pero es condicional a una env var que puede no estar seteada en producción. Confirmar si `ONBOARDING_VIDEO_URL` está seteada antes de decidir si hace falta una plantilla más; si no se puede confirmar, dejarlo pendiente y reportarlo en vez de crearla a ciegas.

---

## 2. Convención de nombres

`{pool}_a{intento}_v{variante}` para las de re-enganche (ej. `phase1_reengage_a1_v1`), y un nombre descriptivo en snake_case para las 3 de Utility (`registration_instructions`, `registration_code_confirm`, `registration_delayed_redirect`). Minúsculas y guion bajo — WhatsApp rechaza espacios y mayúsculas en nombres de plantilla.

Idioma: `es` en las 30.

---

## 3. Mecánica técnica (Content API + Approval Request)

Dos llamadas por plantilla. Mismo endpoint y forma de autenticación que ya usa este repo en [`src/lib/whatsapp/providers/twilio/content.ts`](../src/lib/whatsapp/providers/twilio/content.ts) para contenido de sesión — aquí se reutiliza el mismo patrón, agregando el paso de aprobación que ese archivo no hace (porque hoy solo crea contenido de sesión, nunca plantillas).

### 3a. Crear el Content

```
POST https://content.twilio.com/v1/Content
Authorization: Basic base64(TWILIO_ACCOUNT_SID:TWILIO_AUTH_TOKEN)
Content-Type: application/json
```

Sin botones (Utility, texto simple):
```json
{
  "friendly_name": "registration_instructions",
  "language": "es",
  "types": {
    "twilio/text": {
      "body": "texto exacto aquí"
    }
  }
}
```

Con botones de respuesta rápida (todas las de Marketing, y `registration_code_confirm`):
```json
{
  "friendly_name": "phase1_reengage_a1_v1",
  "language": "es",
  "types": {
    "twilio/quick-reply": {
      "body": "texto exacto aquí",
      "actions": [
        { "title": "✅ Sí, continuar", "id": "reengage:continue" },
        { "title": "❌ No, gracias", "id": "reengage:stop" }
      ]
    }
  }
}
```
Guardar el `sid` (`HXxxxxxxxx…`) que devuelve la respuesta — hace falta para el paso 3b y para que quien conecte el código después pueda referenciarlo.

### 3b. Someter a aprobación de WhatsApp

```
POST https://content.twilio.com/v1/Content/{ContentSid}/ApprovalRequests/whatsapp
Authorization: Basic base64(TWILIO_ACCOUNT_SID:TWILIO_AUTH_TOKEN)
Content-Type: application/json
```
```json
{
  "name": "phase1_reengage_a1_v1",
  "category": "MARKETING"
}
```
`category` es `MARKETING` o `UTILITY` según la tabla de la sección 4. `name` debe ser el mismo nombre que se le dio al Content en 3a (convención de la sección 2).

### Notas importantes
- **Límite de 20 caracteres en el título de botones de respuesta rápida** (regla de Meta, no de Twilio) — los títulos de botones de este documento ya vienen acortados para cumplirlo (ver sección 4.4 para el detalle de qué se acortó y por qué). Si Twilio igual rechaza alguno por longitud, acortarlo conservando el sentido y dejar constancia en este archivo de cuál quedó.
- El `id` de cada botón (el payload) **debe copiarse exactamente** como aparece en la tabla — el parser de webhooks entrantes de Twilio (`src/lib/whatsapp/providers/twilio/normalize-inbound.ts:17-22`) ya sabe leer `ButtonPayload` y mapearlo a `callbackData`; si el `id` configurado coincide con las constantes que ya existen en el código (`REENGAGE_CALLBACK_CONTINUE`/`STOP`, `REGISTER_CALLBACK_YES`/`NO`), no hace falta tocar el webhook para nada.
- Ninguna de las 30 plantillas necesita variables `{{1}}` **excepto** `registration_code_confirm`, que lleva el código de registro — ver 4.4.
- Recomendado: crear y someter **una sola plantilla de prueba primero** (sugerido: `phase1_reengage_a1_v1`, el pool de mayor volumen) y esperar el resultado de la revisión antes de mandar las 30 en lote. El lenguaje de urgencia/escasez ("última oportunidad", "se está cerrando", "expira pronto") es justo el tipo de cosa que Meta puede rechazar en plantillas de Marketing — mejor detectarlo temprano con una que perder tiempo en 30.
- La revisión de Meta tarda de minutos a 24h. Estado consultable vía `GET /v1/Content/{ContentSid}/ApprovalRequests` o en Twilio Console → Content Editor.

---

## 4. Plantillas a crear

### 4.1 — Categoría MARKETING — pool `phase1_reengage` (lead abandonó a mitad de la inscripción)

Todas con `twilio/quick-reply`, botones **idénticos** en las 9: `✅ Sí, continuar` (`id: reengage:continue`) y `❌ No, gracias` (`id: reengage:stop`).

| Nombre | Cuerpo |
|---|---|
| `phase1_reengage_a1_v1` | 👋 Hola, notamos que dejaste la inscripción a mitad de camino. ¿Te ayudamos a completarla? Los datos ya están guardados 💾 |
| `phase1_reengage_a1_v2` | ✨ ¿Dónde andabas? Te extrañamos 😊 Completa tu registro en PanelSmart y empieza a ganar 🎁 |
| `phase1_reengage_a1_v3` | 📱 Casi lo logras! Solo falta terminar tu perfil para acceder a premios exclusivos. ¿Continuamos? ⚡ |
| `phase1_reengage_a2_v1` | 💚 Todavía tienes tiempo de unirte a PanelSmart. Miles ganan premios compartiendo sus compras 🛍️ Completa ahora 👉 |
| `phase1_reengage_a2_v2` | 🎯 Última llamada: Tu registro está al 80%. Solo toma 2 minutos finalizarlo y acceder a recompensas 💰 |
| `phase1_reengage_a2_v3` | 🚀 Aún hay cupo para ti en PanelSmart! Termina tu perfil hoy y comienza a canjear puntos 🏆 |
| `phase1_reengage_a3_v1` | ⏰ Última oportunidad: Tu cupo en PanelSmart expira pronto. ¡Completa ahora! No te arrepentirás 💪 |
| `phase1_reengage_a3_v2` | 🔔 Recordatorio: Tu acceso a premios exclusivos vence en horas. Termina tu inscripción ya 👇 |
| `phase1_reengage_a3_v3` | ⚡ ¿Lo dejamos? Tu lugar en PanelSmart se está cerrando. Completa ahora y empieza a ganar 🎉 |

### 4.2 — Categoría MARKETING — pool `phase2_link_reminder` (lead no descargó la app)

Mismos botones que 4.1. Los links de iOS/Android van como texto plano al final del cuerpo (no como botón — decisión ya tomada en el doc de Meta, se mantiene aquí por consistencia).

| Nombre | Cuerpo |
|---|---|
| `phase2_link_reminder_a1_v1` | 📲 ¿Ya descargaste la app de PanelSmart? En cuanto la tengas, te enviamos tu código de registro al toque.\n\n📱 iOS: https://apps.apple.com/us/app/panelsmart/id900007535?l=es\n🤖 Android: https://play.google.com/store/apps/details?id=com.lumi.kwpsmartpanel&hl=es_US&gl=US |
| `phase2_link_reminder_a1_v2` | 🎁 Estás a un paso de empezar a ganar premios — solo falta descargar la app. ¿Te ayudamos?\n\n📱 iOS: https://apps.apple.com/us/app/panelsmart/id900007535?l=es\n🤖 Android: https://play.google.com/store/apps/details?id=com.lumi.kwpsmartpanel&hl=es_US&gl=US |
| `phase2_link_reminder_a1_v3` | ✨ Tu cupo en PanelSmart ya está confirmado, solo falta la app para activarlo 🚀\n\n📱 iOS: https://apps.apple.com/us/app/panelsmart/id900007535?l=es\n🤖 Android: https://play.google.com/store/apps/details?id=com.lumi.kwpsmartpanel&hl=es_US&gl=US |
| `phase2_link_reminder_a2_v1` | ⏳ Sigue pendiente descargar la app de PanelSmart para recibir tu código de registro. No tardes mucho 👇\n\n📱 iOS: https://apps.apple.com/us/app/panelsmart/id900007535?l=es\n🤖 Android: https://play.google.com/store/apps/details?id=com.lumi.kwpsmartpanel&hl=es_US&gl=US |
| `phase2_link_reminder_a2_v2` | 💚 Miles de personas ya están ganando premios en PanelSmart compartiendo sus compras. Descarga la app y súmate 🛍️\n\n📱 iOS: https://apps.apple.com/us/app/panelsmart/id900007535?l=es\n🤖 Android: https://play.google.com/store/apps/details?id=com.lumi.kwpsmartpanel&hl=es_US&gl=US |
| `phase2_link_reminder_a2_v3` | 🔔 Recordatorio: tu código de registro te espera. Descarga la app cuando puedas y te lo enviamos al instante ⚡\n\n📱 iOS: https://apps.apple.com/us/app/panelsmart/id900007535?l=es\n🤖 Android: https://play.google.com/store/apps/details?id=com.lumi.kwpsmartpanel&hl=es_US&gl=US |
| `phase2_link_reminder_a3_v1` | ⏰ Última oportunidad: tu cupo en PanelSmart podría asignarse a otra persona si no descargas la app pronto.\n\n📱 iOS: https://apps.apple.com/us/app/panelsmart/id900007535?l=es\n🤖 Android: https://play.google.com/store/apps/details?id=com.lumi.kwpsmartpanel&hl=es_US&gl=US |
| `phase2_link_reminder_a3_v2` | ⚡ ¿Lo dejamos aquí? Descarga la app ahora y no pierdas tu lugar en PanelSmart.\n\n📱 iOS: https://apps.apple.com/us/app/panelsmart/id900007535?l=es\n🤖 Android: https://play.google.com/store/apps/details?id=com.lumi.kwpsmartpanel&hl=es_US&gl=US |
| `phase2_link_reminder_a3_v3` | 🚨 Este es nuestro último aviso: descarga la app para activar tu cupo antes de que se cierre.\n\n📱 iOS: https://apps.apple.com/us/app/panelsmart/id900007535?l=es\n🤖 Android: https://play.google.com/store/apps/details?id=com.lumi.kwpsmartpanel&hl=es_US&gl=US |

### 4.3 — Categoría MARKETING — pool `phase4_ficha_hogar` (lead dejó la Ficha Hogar a medias)

Mismos botones que 4.1.

| Nombre | Cuerpo |
|---|---|
| `phase4_ficha_hogar_a1_v1` | 🏡 ¡Ya casi terminas! Solo faltan unas preguntas de tu Ficha Hogar para completar tu perfil en PanelSmart. |
| `phase4_ficha_hogar_a1_v2` | 📋 Notamos que dejaste tu Ficha Hogar a mitad de camino. ¿Seguimos? Son solo un par de preguntas más. |
| `phase4_ficha_hogar_a1_v3` | ✨ Un último paso para tu Ficha Hogar y quedas listo para empezar a ganar premios en PanelSmart 🎁 |
| `phase4_ficha_hogar_a2_v1` | 💚 Tu Ficha Hogar sigue incompleta — termínala en un par de minutos y no te pierdas tus premios. |
| `phase4_ficha_hogar_a2_v2` | 🎯 Estás muy cerca: solo faltan algunas preguntas de tu Ficha Hogar para activar tu cupo por completo. |
| `phase4_ficha_hogar_a2_v3` | 🚀 Completa tu Ficha Hogar hoy y empieza a disfrutar de todos los beneficios de PanelSmart. |
| `phase4_ficha_hogar_a3_v1` | ⏰ Último aviso: completa tu Ficha Hogar pronto o podrías perder tu lugar en el panel. |
| `phase4_ficha_hogar_a3_v2` | 🔔 Recordatorio final: tu Ficha Hogar quedó a medias. Termínala ahora para no perder tu cupo. |
| `phase4_ficha_hogar_a3_v3` | ⚡ ¿Seguimos? Tu Ficha Hogar está casi lista — solo falta este último paso. |

### 4.4 — Categoría UTILITY — entrega y estado del código de registro (3 plantillas)

| Nombre | Tipo Twilio | Cuerpo | Variables | Botones |
|---|---|---|---|---|
| `registration_instructions` | `twilio/text` | 📋 Estos son los pasos para registrarte en la app; tu código de registro va justo a continuación 👇\n\n1️⃣ Abre la app e ingresa a «¿Ha olvidado su contraseña?».\n2️⃣ Escribe tu código de usuario y pulsa «entregar».\n3️⃣ Escribe los últimos 4 dígitos de tu celular (el mismo que colocaste para contactarte).\n4️⃣ Recibirás un código por mensaje de texto a tu número de celular; escríbelo para terminar la verificación.\n\nSi tienes cualquier duda durante el registro, escríbeme y te ayudo. | ninguna | — |
| `registration_code_confirm` | `twilio/quick-reply` | ✅ Tu código de registro es: {{1}}\n\nCuando hayas "activado" la app con ese código, confirma aquí: | `{{1}}` = código de registro (string) | `✅ Ya me registré` (`id: register:yes`) · `❌ No registré aún` (`id: register:no`) |
| `registration_delayed_redirect` | `twilio/text` | Tu código de registro está tardando más de lo esperado en llegar. No te preocupes, nuestro equipo se pondrá en contacto contigo para ayudarte a completar tu registro. | ninguna | — |

**Nota sobre `registration_code_confirm`:** el mensaje original en código (`src/lib/onboarding/deliver-registration-code.ts:49-54`) agrega a veces un sufijo " (mock)" después de "registro" cuando `REGISTRATION_CODE_MOCK_ENABLED=true` — es una bandera de testing interna, no debe ir en la plantilla de producción aprobada por Meta. La plantilla de arriba omite ese sufijo a propósito; el modo mock, si hace falta seguir probándolo, puede seguir usando el envío de texto libre actual (solo se usa en desarrollo).

**Botones acortados respecto al texto actual del código — conteo verificado carácter por carácter (incluye el emoji y el espacio):**

| Botón | Texto actual en el código | Long. | Texto en este documento | Long. |
|---|---|---|---|---|
| `reengage:continue` | "✅ Sí, quiero continuar" | 22 — **excede** | "✅ Sí, continuar" | 15 ✓ |
| `reengage:stop` | "❌ No, gracias" | 13 ✓ (sin cambio) | "❌ No, gracias" | 13 ✓ |
| `register:yes` | "✅ Ya me registré" | 16 ✓ (sin cambio) | "✅ Ya me registré" | 16 ✓ |
| `register:no` | "❌ No pude registrarme" | 21 — **excede** | "❌ No registré aún" | 17 ✓ |

El límite de Meta es 20 caracteres. Los dos que excedían se acortaron con margen (no al límite justo, para no depender de si Twilio cuenta el emoji distinto) conservando el `id`/payload exacto — el código existente sigue reconociendo el tap sin ningún cambio en el webhook. Los dos que ya entraban se dejaron igual.

---

## 5. Checklist de esta tarea

- [ ] Verificar prerrequisito de la sección 0 (Twilio es el proveedor real en producción) — **detenerse y reportar si no se puede confirmar**.
- [ ] Crear y someter a aprobación `phase1_reengage_a1_v1` sola, esperar resultado.
- [ ] Si aprueba sin cambios de tono: crear y someter el resto de 4.1, luego 4.2, luego 4.3 (26 restantes).
- [ ] Crear y someter las 3 de 4.4.
- [ ] Dejar registrado en algún lugar accesible (comentario en este archivo, hoja de cálculo, lo que use el equipo) la tabla: nombre de plantilla → Content SID → estado de aprobación → fecha, para que quien conecte el código (parte 2, abajo) no tenga que volver a consultar Twilio Console plantilla por plantilla.
- [ ] Reportar cualquier plantilla rechazada, con el motivo que dé Meta, para ajustar el texto.

---

## 6. Qué sigue después (no es parte de esta tarea, solo contexto)

Una vez las 30 plantillas estén aprobadas, alguien tiene que conectar el código para que las use en vez del texto libre actual:
- Guardar el Content SID de cada plantilla aprobada (columna nueva en `message_variants` para las 27 de re-enganche; en algún lado análogo para las 3 de registro).
- Reemplazar los `sendInlineKeyboard`/`sendText` actuales en `src/app/api/jobs/re-engage/route.ts` y `src/lib/onboarding/deliver-registration-code.ts` por un envío `client().messages.create({ contentSid, contentVariables, from, to })` — mismo mecanismo que ya usa `sendTwilioKeyboard` en [`src/lib/whatsapp/providers/twilio/send.ts`](../src/lib/whatsapp/providers/twilio/send.ts) para contenido de sesión, solo que apuntando al Content SID de la plantilla aprobada en lugar de uno generado on-the-fly.
- Mantener texto libre como fallback en Telegram/web (no tienen esta restricción) y en cualquier pool/mensaje sin plantilla aprobada todavía, para poder migrar de a uno sin bloquear el resto.
- Decidir qué hacer con el caption del video de onboarding (ver nota de "fuera de alcance" en la sección 1) si `ONBOARDING_VIDEO_URL` resulta estar seteada en producción.

---

## 7. Opcional / no ejecutar ahora — colchón de continuidad

**No es parte de esta tarea.** Las 91 respuestas reactivas del bot (encuesta, gates, confirmaciones, Ficha Hogar, etc.) son válidas como texto libre hoy — no hay ningún requisito de Meta que las obligue a ser plantilla, y convertirlas tendría costo real por mensaje sin ganancia de cumplimiento. Construir esto **solo** si el equipo decide proactivamente blindarse contra un escenario puntual: que Meta baje la calificación de calidad del número y lo restrinja a "solo plantillas" — ahí, cualquier mensaje reactivo que no tenga plantilla aprobada simplemente no podría salir, aunque sea una respuesta directa dentro de ventana.

Si en algún momento se decide construir ese colchón, no hace falta cubrir las 91 — priorizar por lo que realmente sostiene el negocio si el número queda restringido: los mensajes de la ruta principal (los que ve casi todo lead) primero, los de soporte de esa ruta después, y dejar afuera lo que es edge-case o depende de contenido dinámico (no se puede congelar en una plantilla de todos modos).

No se transcriben los textos acá — al ser "por si acaso" y no una tarea activa, mejor tomarlos frescos del código en el momento de construir esto (pueden haber cambiado) que dejar una copia que se desactualiza. Se referencia archivo:línea.

### Tier A — ruta principal (la prioridad real de este colchón)

Si el número queda restringido y estos no tienen plantilla, ningún lead nuevo puede avanzar del todo por el flujo — es la parte que de verdad vale la pena blindar.

| Mensaje | Archivo:línea |
|---|---|
| Saludo inicial + opt-in | `phase-1.ts:29` |
| Términos y condiciones (D1) | `phase-1.ts:31` |
| Consentimiento de re-enganche | `phase-1.ts:32-33` |
| Gate D3 ("¿administras las compras del hogar?") | `phase-1.ts:34` |
| Las 19 preguntas de la encuesta Fase 1 (Q1–Q19) | `survey-questions.ts:34-267` |
| Prompt de ubicación GPS | `messaging/send.ts:208-209` |
| "✅ Ubicación recibida" | `gps-capture.ts:226` |
| "🎉 ¡Felicidades! Tienes un cupo disponible" (entrada a Fase 2) | `phase-2.ts:16-23` |
| Las 7 preguntas de Ficha Hogar (Q1–Q7) | `ficha-hogar-questions.ts:16-87` |
| "¡Listo! Has completado tu registro" | `phase-4.ts:290-293` |
| "Gracias por tu interés y por el tiempo que has dedicado 🙌" (cierre final) | `phase-4.ts:299` |

*(~29 plantillas si se cuenta cada pregunta por separado; las de Q3/Q4 tienen redacción alterna en Costa Rica/Guatemala — sumaría variantes extra si se quiere cubrir eso también.)*

### Tier B — soporte de la ruta principal (prioridad media)

Se activan seguido, pero un lead no se queda trabado sin ellos — degradan la experiencia, no la bloquean del todo.

| Mensaje | Archivo:línea |
|---|---|
| Opt-in re-mostrado (no se entendió la respuesta) | `phase-1.ts:30` |
| "No entendí lo que respondiste 🤔" (retry genérico) | `exit-messages.ts:18` |
| Despedida estándar (no calificó) | `exit-messages.ts:3-4` |
| Despedida cupo lleno / no comprador | `exit-messages.ts:6-7` |
| "🎉 ¡Gracias por tus respuestas!" | `exit-messages.ts:9` |
| "De acuerdo, continuamos con las preguntas de ubicación" | `gps-capture.ts:197` |
| "Este paso ya no está pendiente" (tras tap fuera de estado) | `app-downloaded.ts:18` |
| "¡Perfecto! Estamos generando tu código de registro…" | `app-downloaded.ts:28` |
| "Aún no hemos podido confirmar tu código de registro…" | `flow-router.ts:268` |
| Recordatorio de confirmación de registro | `registration-choice.ts:16-19` |
| "✅ ¡Genial! Confirmamos tu registro." | `registration-choice.ts:38` |
| Redirección de soporte tras "No pude registrarme" | `phase-3.ts:16-19` |
| "Te comunico con nuestro equipo 📲…" (handoff a agente) | `exit-messages.ts:25-27` |
| Confirmación de opt-out | `flow-router.ts:155-158` |
| "¡Listo! Empezamos de nuevo 🚀" | `flow-router.ts:130` |

### Explícitamente afuera de este colchón (aunque sea "por si acaso")

- **Flujo de corrección** (encuesta y Ficha Hogar, ~16 mensajes) — casi todos llevan el nombre de campo o el valor interpolado, y solo se activan si el usuario pide corregir algo explícitamente. Bajo volumen, alto costo de mantener como plantilla.
- **Errores de validación geográfica** (~5 mensajes agrupados) — todos interpolados (departamento, ejemplos, coincidencia difusa), edge-case.
- **Las 27 respuestas de FAQ** — el bot elige cuál mandar en tiempo real por similitud semántica con lo que preguntó el usuario; convertir las 27 no reduce el riesgo real (ya son gratis y reactivas) y son 27 aprobaciones más para contenido que rara vez se agota en la práctica.
- **Respuestas generadas por IA** (aclaraciones de FAQ, `decline-followup.ts`) — no tienen texto fijo que congelar; templatizarlas implicaría rediseñar esa parte como texto estático, lo cual le quita el propósito.

---

## Referencias

- [`docs/whatsapp-marketing-templates-migration.md`](whatsapp-marketing-templates-migration.md) — misma tarea de las 27 Marketing, versión Meta WhatsApp Manager (usar en su lugar si producción termina estando en `meta`, no en `twilio`).
- [`src/lib/db/seed/message-variants.ts`](../src/lib/db/seed/message-variants.ts) — fuente de verdad de los 27 textos de re-enganche.
- [`src/lib/onboarding/deliver-registration-code.ts`](../src/lib/onboarding/deliver-registration-code.ts) y [`src/lib/conversation/exit-messages.ts`](../src/lib/conversation/exit-messages.ts) — fuente de los 3 textos de Utility.
- [`src/lib/whatsapp/providers/twilio/content.ts`](../src/lib/whatsapp/providers/twilio/content.ts) — patrón ya existente de creación de Content en este repo (sesión, no plantillas — referencia de estilo/autenticación).
- [`src/lib/whatsapp/providers/twilio/normalize-inbound.ts`](../src/lib/whatsapp/providers/twilio/normalize-inbound.ts) — confirma que el webhook entrante ya sabe leer `ButtonPayload`, sin cambios necesarios.
