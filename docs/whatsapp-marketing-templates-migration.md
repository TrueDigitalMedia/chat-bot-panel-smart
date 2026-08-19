# Migración de mensajes de re-enganche a plantillas de WhatsApp (Meta)

## Por qué

El bot nunca usa plantillas de WhatsApp (`type: 'template'`) — todos los mensajes salen como texto de sesión libre (`type: 'text'` / `type: 'interactive'`), incluidos los 27 textos de re-enganche (`message_variants`) que contienen lenguaje de incentivo/urgencia ("gana premios", "última oportunidad", "tu cupo se está cerrando"). Meta clasifica ese contenido como **Marketing** y espera que se envíe vía plantilla aprobada, no como texto libre — independientemente de si el envío cae dentro de la ventana de 24h. Este es el punto pendiente #1 de la auditoría de cumplimiento de políticas de WhatsApp (ver commits `e1218f9`, `0d22634`, `88a6e14`, `271173f` para el resto de los fixes ya aplicados).

El listado completo de los 27 textos a migrar (verificado contra la tabla `message_variants` real en Neon) está más abajo, y coincide 1:1 con [`src/lib/db/seed/message-variants.ts`](../src/lib/db/seed/message-variants.ts).

---

## Listado completo de las 27 variantes a migrar

Nombre de plantilla sugerido (`{pool}_a{intento}_v{variante}`) y el texto exacto de cada una.

### `phase1_reengage` — lead abandonó a mitad de la inscripción

| Plantilla | Texto |
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

### `phase2_link_reminder` — lead está `link_sent`, no descargó la app

| Plantilla | Texto |
|---|---|
| `phase2_link_reminder_a1_v1` | 📲 ¿Ya descargaste la app de PanelSmart? En cuanto la tengas, te enviamos tu código de registro al toque. |
| `phase2_link_reminder_a1_v2` | 🎁 Estás a un paso de empezar a ganar premios — solo falta descargar la app. ¿Te ayudamos? |
| `phase2_link_reminder_a1_v3` | ✨ Tu cupo en PanelSmart ya está confirmado, solo falta la app para activarlo 🚀 |
| `phase2_link_reminder_a2_v1` | ⏳ Sigue pendiente descargar la app de PanelSmart para recibir tu código de registro. No tardes mucho 👇 |
| `phase2_link_reminder_a2_v2` | 💚 Miles de personas ya están ganando premios en PanelSmart compartiendo sus compras. Descarga la app y súmate 🛍️ |
| `phase2_link_reminder_a2_v3` | 🔔 Recordatorio: tu código de registro te espera. Descarga la app cuando puedas y te lo enviamos al instante ⚡ |
| `phase2_link_reminder_a3_v1` | ⏰ Última oportunidad: tu cupo en PanelSmart podría asignarse a otra persona si no descargas la app pronto. |
| `phase2_link_reminder_a3_v2` | ⚡ ¿Lo dejamos aquí? Descarga la app ahora y no pierdas tu lugar en PanelSmart. |
| `phase2_link_reminder_a3_v3` | 🚨 Este es nuestro último aviso: descarga la app para activar tu cupo antes de que se cierre. |

Las 9 variantes de este pool llevan siempre, además, estos dos links fijos al final (no varían por lead — pueden ir como texto literal en el cuerpo de la plantilla, no hace falta variable `{{1}}`):
```
📱 iOS: https://apps.apple.com/us/app/panelsmart/id900007535?l=es
🤖 Android: https://play.google.com/store/apps/details?id=com.lumi.kwpsmartpanel&hl=es_US&gl=US
```

### `phase4_ficha_hogar` — lead dejó la Ficha Hogar a medias

| Plantilla | Texto |
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

---

## Parte 1 — Qué hacer en Meta (WhatsApp Manager)

### Prerrequisitos
- Acceso de administrador o editor al **Meta Business Manager** de la cuenta que tiene la WhatsApp Business Account (WABA) usada por este bot (el mismo número detrás de `WHATSAPP_PHONE_NUMBER_ID`/`WHATSAPP_ACCESS_TOKEN` en `.env`).
- No hace falta ninguna credencial nueva — las plantillas se envían por el mismo endpoint (`/{version}/{PHONE_NUMBER_ID}/messages`) y el mismo token que ya usa `graphSend` (`src/lib/whatsapp/providers/meta/graph.ts`).

### Pasos
1. Entrar a **business.facebook.com → WhatsApp Manager → Administración de cuentas → Plantillas de mensajes**.
2. Por cada uno de los 27 textos del [listado completo](#listado-completo-de-las-27-variantes-a-migrar) de arriba, crear una plantilla nueva:
   - **Nombre**: usar una convención sistemática que se pueda mapear 1:1 de vuelta al código, por ejemplo `{pool}_a{attemptNumber}_v{variantOrder}` → `phase1_reengage_a1_v1`, `phase1_reengage_a1_v2`, `phase2_link_reminder_a3_v2`, etc. (minúsculas, guion bajo — Meta no acepta espacios ni mayúsculas en nombres de plantilla).
   - **Categoría**: `Marketing`.
   - **Idioma**: `Español` (código `es`) — genérico, salvo que el equipo prefiera fijar una variante regional específica (`es_MX`, etc.).
   - **Cuerpo**: pegar el texto tal cual (sin los links de iOS/Android en el caso de `phase2_link_reminder` si se quiere usar un botón de tipo "Visitar sitio web" en su lugar — ver nota abajo — o dejarlos como texto plano, que también es válido).
   - **Botones**: agregar dos botones de **respuesta rápida** (quick reply), **en las 27 plantillas por igual** — el job de re-engage (`src/app/api/jobs/re-engage/route.ts`) siempre adjunta el mismo par de botones sin importar el pool:
     - Texto `✅ Sí, quiero continuar` → **payload** `reengage:continue`
     - Texto `❌ No, gracias` → **payload** `reengage:stop`

     ⚠️ **El payload debe ser exactamente ese string** (coincide con `REENGAGE_CALLBACK_CONTINUE`/`REENGAGE_CALLBACK_STOP` en [`src/lib/conversation/reengage-choice.ts`](../src/lib/conversation/reengage-choice.ts)). El parser de webhooks entrantes (`src/lib/whatsapp/providers/meta/normalize-inbound.ts:63-64`) **ya sabe leer** el tap de un botón de plantilla (`message.type === 'button'` → `message.button.payload`) y lo mapea directo a `callbackData` — si el payload configurado en Meta coincide con esas dos constantes, **no hace falta tocar el webhook en absoluto**.
3. Someter cada plantilla a revisión. Recomendación: **enviar primero 1 sola plantilla de prueba** (por ejemplo `phase1_reengage_a1_v1`) y esperar el resultado antes de mandar las 27 en lote — así se detecta temprano si el tono ("última oportunidad", "se está cerrando", "expira pronto", "no te arrepentirás") dispara un rechazo por lenguaje de urgencia/escasez engañosa, algo que Meta revisa activamente en plantillas de Marketing. Si rechaza alguna, suavizar la redacción y volver a enviar.
4. La revisión suele tardar minutos a 24h. El estado de cada plantilla se ve en WhatsApp Manager: `En revisión` / `Aprobada` / `Rechazada`.
5. Por cada plantilla **aprobada**, anotar su **nombre exacto** y **código de idioma** — son los dos valores que hacen falta en el código (parte 2).

---

## Parte 2 — Qué hacer a nivel de código, una vez aprobadas

No hace falta esperar a tener las 27 aprobadas para empezar — el rollout puede ser pool por pool.

### 1. Schema: guardar el nombre de plantilla aprobado por variante
En [`src/lib/db/schema.ts`](../src/lib/db/schema.ts), agregar a `messageVariants`:
```ts
metaTemplateName: varchar('meta_template_name', { length: 512 }),
metaTemplateLanguage: varchar('meta_template_language', { length: 10 }),
```
Ambas nullable — así una fila sin plantilla aprobada todavía sigue funcionando con el fallback de texto libre (ver punto 4). Generar la migración (`npm run db:generate`), revisar el `.sql` resultante, y **aplicarla contra la Neon real en la misma sesión** (`npm run db:migrate`) — no dejarla solo commiteada.

### 2. Cargar los nombres de plantilla aprobados
Una vez Meta aprueba, hacer un `UPDATE message_variants SET meta_template_name = '...', meta_template_language = 'es' WHERE pool = '...' AND attempt_number = ... AND variant_order = ...` por cada fila (o extender [`src/lib/db/seed/message-variants.ts`](../src/lib/db/seed/message-variants.ts) con los nombres y correr un script de backfill — cualquiera de las dos formas sirve, lo importante es que quede reflejado en la tabla real, no solo en el seed).

### 3. Función de envío de plantilla (Meta)
En [`src/lib/whatsapp/providers/meta/send.ts`](../src/lib/whatsapp/providers/meta/send.ts), agregar (mismo estilo que `sendMetaText`/`sendMetaKeyboard`):
```ts
export async function sendMetaTemplate(
  channelUserId: string,
  templateName: string,
  languageCode: string,
): Promise<string | undefined> {
  requireMeta()
  const to = toMetaRecipient(channelUserId)
  const id = await graphSend({
    messaging_product: 'whatsapp',
    to,
    type: 'template',
    template: { name: templateName, language: { code: languageCode } },
  })
  return id
}
```
Ninguna de las 27 plantillas necesita variables (no hay datos personalizados por lead), así que no hace falta `components` en el payload — solo si más adelante se agrega una plantilla con `{{1}}` en el cuerpo.

Exponer el wrapper correspondiente en [`src/lib/whatsapp/send.ts`](../src/lib/whatsapp/send.ts) (`sendWhatsAppTemplate`), igual que ya existen `sendWhatsAppText`/`sendWhatsAppKeyboard` — Twilio no tiene una función equivalente todavía (usa su propio Content API para plantillas, es un mecanismo distinto); si el proveedor activo llega a ser `twilio` en algún momento, esta función necesitaría su propia implementación aparte, fuera del alcance de este documento.

### 4. Conectar el job de re-engage
En [`src/app/api/jobs/re-engage/route.ts`](../src/app/api/jobs/re-engage/route.ts), la rama `action === 're-engage'` hoy hace:
```ts
const message = await getNextMessageVariant(lead.id, attempt, pool)
await sendInlineKeyboard(lead, message, [[...continuar/no, gracias...]])
```
`getNextMessageVariant` ([`src/lib/scheduler/messages.ts`](../src/lib/scheduler/messages.ts)) necesita devolver también `metaTemplateName`/`metaTemplateLanguage` de la fila elegida (hoy solo devuelve el texto). Con eso:
```ts
if (lead.channel === 'whatsapp' && variant.metaTemplateName) {
  await sendWhatsAppTemplate(lead, variant.metaTemplateName, variant.metaTemplateLanguage ?? 'es')
} else {
  await sendInlineKeyboard(lead, variant.text, [[...continuar/no, gracias...]]) // fallback: telegram/web, o pool aún sin plantilla aprobada
}
```
El fallback a texto libre para pools sin plantilla todavía aprobada es lo que permite migrar de a un pool por vez sin bloquear el resto. Telegram y Web no tienen esta restricción de Meta, así que siguen mandando el texto libre normal siempre.

Idealmente esta rama nueva se agrega como una función en `src/lib/messaging/send.ts` (ej. `sendTemplateOrKeyboard`) para que siga pasando por `logOut`/`logConversationMessage` igual que el resto de los envíos — así el histórico de conversación en el admin sigue mostrando el texto real enviado, aunque técnicamente se haya mandado como referencia a una plantilla.

### 5. Webhook entrante — no requiere cambios
Confirmado al revisar `src/lib/whatsapp/providers/meta/normalize-inbound.ts:63-64`: ya maneja `message.type === 'button'` (el tipo que Meta usa cuando alguien toca un botón de una plantilla) mapeando `message.button.payload` a `callbackData`, exactamente igual que hoy hace con los botones interactivos (`message.type === 'interactive'`). Mientras el payload configurado en Meta (paso 2 de la Parte 1) coincida con `reengage:continue`/`reengage:stop`, todo el resto del flujo (`reengage-choice.ts`, `flow-router.ts`) sigue funcionando sin tocarlo.

### 6. Pruebas
- Probar cada plantilla contra un número de prueba antes de activarla en producción — verificar que el texto se vea igual que el aprobado y que tocar cada botón dispare el `callbackData` esperado (revisar los logs `[whatsapp:in]` en `handle-inbound.ts`).
- Confirmar en `system_call_logs`/logs de servidor que no aparecen errores `132001` (plantilla no encontrada) o `132000` (parámetro de plantilla inválido) al enviar.

### 7. Orden de rollout sugerido
1. `phase1_reengage` primero (el pool de mayor volumen, y el que salió en el caso auditado).
2. `phase2_link_reminder`.
3. `phase4_ficha_hogar`.

### 8. Limpieza final
Una vez las 27 filas de `message_variants` tengan `meta_template_name`, decidir si:
- eliminar el fallback de texto libre en `messages.ts` (`getFallbackMessage`) y en `sendInlineKeyboard` del punto 4, dejando el envío por plantilla como único camino para WhatsApp, o
- conservarlo solo como red de seguridad para el caso borde de una fila sin plantilla (lead nuevo, pool agregado a futuro).
