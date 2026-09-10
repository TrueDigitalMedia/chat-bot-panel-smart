# Auditoría — Alerta "Sending spam" WABA Panelsmart Latino

**Fecha:** 2026-09-10
**WABA:** 1577841630641974 · **Ventana de apelación:** hasta 2026-12-09
**Alcance del análisis:** logs de Twilio (últimos 5 días, 37.387 mensajes), tabla `conversation_messages` y `leads` en Neon, y revisión de la capa de envío / re-engagement / opt-out.

---

## 1. Resumen ejecutivo

La alerta **no** corresponde a un patrón clásico de blasting a números fríos. La evidencia:

- **0 mensajes salientes** a leads después de que hicieron opt-out o declinaron (verificado en DB). El bot respeta el STOP.
- **Solo 12 de 1.314 destinatarios** nunca respondieron en la ventana. El 99% del tráfico es conversacional (click-to-WhatsApp → el usuario escribe primero).
- Índice de lectura real **85%** (16.921 leídos / 19.948 enviados).
- Re-engagement ya está muy acotado: **1 solo nudge**, techo de 4 salientes sin respuesta, cadencia dentro de la ventana de 24 h.

El problema real es **volumen y fricción**, no consentimiento:

| Señal | Dato | Riesgo |
|---|---|---|
| Concentración en 1 número | 19.863 / 19.948 salientes (99,6%) desde **+1 786-933-7825** | La calidad se calcula por número; todo el peso cae en uno |
| Volumen | ~4.000 mensajes/día sostenidos, picos de 349/h | Meta lo lee como patrón de bulk |
| Abandono en el primer mensaje | **52% de los leads** (577/1.103) quedan `incomplete` en fase 1, qidx ≈ 1 | Gente que tocó el anuncio, recibió el saludo y bloqueó/ignoró → genera los reportes |
| Mensajes por lead completado | ficha_hogar promedia **46 salientes**, cola hasta 157 | Cada punto de fricción se multiplica por número frío |
| Atribución de anuncio | `acquisition_source` NULL en 1.101/1.103 leads | Imposible saber qué creativo genera los bloqueos |
| Ruteo multi-número (spec 017) | `whatsapp_phone_number_id` NULL en 1.052/1.103 leads → todo va al número default | La infra para repartir carga existe pero **no está activa en prod** |
| Webhook de entrada caído | 19 errores `11200` (Twilio no pudo entregar el inbound a nuestro endpoint) en el número +1 572-219-2733 | Respuestas/STOP que no vemos → seguimos escribiendo → parece spam |
| Opt-out directo a Twilio | 23 errores `21610` (envío a número dado de baja en Twilio) | No hay lista de supresión sincronizada; lo descubrimos recién al fallar el envío |

---

## 2. Lo que YA está bien (usar en la apelación)

Estos puntos son defendibles y conviene mencionarlos textualmente:

1. **Opt-out honrado a nivel motor, no solo texto.** `flow-router.ts` corta en dos niveles: regex barato (`isOptOutRequest`) + pre-filtro de keywords (`mightBeOptOutIntent`) que dispara una confirmación por IA (`detectOptOutIntent`). Tras el opt-out: se cancelan los jobs pendientes, se marca terminal, se registra `consent_event` y se manda **un** acuse fijo, una vez, luego silencio (`alreadySentOptOutAck`).
2. **Verificado en datos:** 0 salientes a leads con `status_reason` de opt-out/decline después del corte. 0 re-contactos a `not_qualified` / `abandono` / `quota_exhausted`.
3. **Circuit breakers en la capa de transporte** (`messaging/send.ts`):
   - `MAX_CONSECUTIVE_REPEATS = 3` — nunca el mismo texto 3+ veces seguidas.
   - `MAX_OUTBOUND_WITHOUT_REPLY = 5` — corta todo saliente si se acumulan 5 sin respuesta.
   - `dedupeRepeat` suprime duplicados < 4 s (webhooks concurrentes).
4. **Re-engagement conservador** (`scheduler/constants.ts`): `MAX_REENGAGEMENT_ATTEMPTS = 1`, `REENGAGE_OUTBOUND_CEILING = 4`, cadencia total < 24 h. `scheduleRecontact` no arma cadencia nueva si el lead ya pasó el techo.
5. **STOP de Twilio Advanced Opt-Out** capturado vía error 21610 → `handle-twilio-stop.ts` sincroniza el opt-out aunque Twilio no reenvíe el inbound.
6. **Consentimiento explícito de WhatsApp en el primer mensaje:** *"Al responder SÍ, aceptás recibir encuestas y notificaciones de PanelSmart por este canal. Podés darte de baja en cualquier momento respondiendo STOP."*

---

## 3. Hallazgos y mejoras — código

### P0 — arreglar antes de apelar

> **Estado 2026-09-10:** 3.1 y 3.2 implementados (rama `debug/twilio-signature-account-sid`).
> Pendiente: aplicar la migración `0033_messaging_suppressions` a Neon (`npm run db:migrate`)
> y desplegar. Detalle de la causa raíz de 3.1 abajo, confirmada con Twilio Monitor Alerts.

**3.1 Webhook de entrada de Twilio falla la verificación de firma (errores 11200)**
`src/app/api/webhooks/whatsapp/twilio/route.ts:31` devuelve 403 cuando `verifyTwilioSignature` falla. Hay una rama de debug activa (`debug/twilio-signature-account-sid`) precisamente por esto. Impacto directo en la alerta: si el inbound con "STOP" / "no me interesa" / una queja llega con firma que no valida, **nunca se procesa** y el bot sigue su cadencia. 19 inbounds perdidos en 5 días, concentrados en +1 572-219-2733.
**Causa raíz confirmada** (Twilio Monitor Alerts, últimos 6 días):
- El número/Messaging Service de prod postea a `https://chat-bot-panel-smart.vercel.app/api/webhooks/whatsapp` y recibe `403 {"error":"Invalid signature"}`. `resolveTwilioWebhookUrl` devolvía `TWILIO_WEBHOOK_URL` **verbatim** (apuntando a la ruta `/twilio`), así que la URL que reconstruíamos nunca coincidía con la que Twilio firmó (la ruta primaria). Path mismatch.
- Ruido adicional no accionable en código: un túnel ngrok de alguien (`mac-shaky-vulnerably.ngrok-free.dev`) y deploys preview de Vercel (`*-git-*.vercel.app`, protegidos) siguen registrados en algún número de Twilio → repuntar esos webhooks a prod.

**Implementado:** `twilioWebhookUrlCandidates(request)` reconstruye la URL desde los headers `x-forwarded-host`/`-proto` + el path real de la request, y `verifyTwilioSignature` valida contra **todas** las variantes plausibles (ambas rutas, con/sin slash, http/https, host del env) — acepta si alguna valida. Warning de una línea visible en prod en cada fallo; brute-force detallado sólo con `TWILIO_SIGNATURE_DEBUG`. Tests en `providers/twilio/verify.test.ts`.

**3.2 No hay lista de supresión persistente propia (errores 21610)**
Hoy el opt-out vive como `lead_status` terminal. Si el mismo teléfono vuelve a entrar por otro anuncio se crea un lead nuevo sin memoria del opt-out previo. 23 envíos en 5 días rebotaron por 21610 (Twilio los frenó; Meta igual cuenta el intento).
**Implementado:**
- Tabla `messaging_suppressions (channel, identifier, reason, source, lead_id, created_at)` — `identifier` = teléfono E.164 normalizado (o BSUID / id de telegram), único por `(channel, identifier)`. Migración `0033_messaging_suppressions.sql`.
- `src/lib/db/suppressions.ts`: `isRecipientSuppressed`, `suppressRecipient`, `unsuppressRecipient`, `suppressionIdentifiers` (normaliza y matchea tanto `channelUserId` como el `phoneNumber` guardado).
- **Escritura centralizada en `transitionLead`**: cualquier transición con un `statusReason` de `OPT_OUT_STATUS_REASONS` (freetext STOP, decline de nudge de re-engage, `twilio_stop`/21610) escribe la supresión — cubre los 3 call sites actuales y cualquiera futuro. Fire-and-forget, nunca bloquea la transición.
- **Lectura en `messaging/send.ts`**: `shouldSkipSend` chequea la lista antes de todo saliente (por teléfono, no por lead → un teléfono que vuelve por otro anuncio en un lead nuevo sigue suprimido). Fail-open si la lectura falla. La confirmación del propio opt-out pasa `bypassSuppression: true`.
- Reversión de opt-out (`flow-router.ts`): `unsuppressRecipient` al confirmarse un re-ingreso.
- Decline de opt-in **no** entra a la lista automáticamente (no es "no me contacten nunca más"); se puede añadir sumándolo a `OPT_OUT_STATUS_REASONS`.
- Tests: `db/suppressions.test.ts`, casos nuevos en `messaging/send.test.ts` y `state-machine/index.test.ts`.

**3.3 Activar el ruteo multi-número (spec 017)**
`whatsapp_phone_number_id` viene NULL en el 95% de los leads → `waFrom()` cae al default y todo el volumen se concentra en el número que Meta marcó. La infra (`number-registry.ts`, `WHATSAPP_NUMBER_MAP`) ya existe.
→ Verificar que `WHATSAPP_NUMBER_MAP` esté seteado en prod y que el webhook capture `To` correctamente. **No** mover tráfico al +1 572 como parche — el flag es de cuenta; repartir solo tiene sentido junto con la reducción de volumen.

### P1 — reduce fricción y volumen (la causa de los reportes)

**3.4 Capturar atribución de anuncio (CTWA)**
El webhook de Twilio no lee la metadata de referral (`ReferralBody`, `Headline`, `SourceId`/`ctwa_clid`, `SourceType`). Sin esto no se puede decir en la apelación *"el creativo X generaba la fricción, lo pausamos"*, ni monitorear a futuro.
→ En `route.ts` / `normalizeTwilioInbound`, extraer esos campos y persistirlos en `leads.acquisition_source` (+ una columna `ctwa_ref` jsonb). Dashboard: bloqueo/abandono por creativo.

**3.5 El 52% muere en el primer mensaje — revisar match anuncio → saludo**
`GREETING_TEXT` (`phases/phase-1.ts:31`) abre con *"Te invitamos a unirte a nuestro panel…"* — redacción de push saliente para alguien que **ya tocó un anuncio**. Si el anuncio prometía un premio / una encuesta puntual y el bot arranca pidiendo inscripción a un panel + T&C + permiso de contacto (3 mensajes antes de cualquier valor), la gente bloquea.
→ Alinear el primer renglón del bot con la promesa del creativo. Mover T&C y el permiso de re-contacto a **después** de la primera pregunta real (o diferirlos a cuando haya cupo). Medir abandono fase-1 antes/después.

**3.6 Longitud del cuestionario**
~20 preguntas de screening + ~20 de ficha hogar, cada una como mensaje individual. 40+ salientes por lead completo es mucho volumen agregado.
→ Agrupar preguntas compatibles en un solo mensaje (list-picker con varias, o "responde en una línea: edad, género, municipio"). Cada mensaje que se elimina es −1 en el conteo agregado que mira Meta.

**3.7 Botón "No me interesa" explícito en los nudges y en opt-in**
Hoy el decline de opt-in es un botón "No"; el nudge de re-engage trae Continue/Stop. Está bien, pero conviene que **toda** plantilla de re-engage y el saludo tengan un botón de baja limpio — convierte un bloqueo (señal negativa para Meta) en un opt-out ordenado (neutro).
→ Añadir `callback_data: 'optout:soft'` a `phase1_reengage_*` y al keyboard de `OPT_IN_TEXT`.

**3.8 `mightBeOptOutIntent` ignora mensajes > 300 caracteres** (`opt-out-heuristic.ts:41`)
Una queja larga y enojada ("me mandan esto todos los días, es una falta de respeto, …") no dispara la detección.
→ Subir el límite a ~600, o correr la detección sobre los primeros 300 caracteres en vez de descartar.

### P2 — endurecimiento / guardarraíl `messaging-health`

**3.9 Rate limit por número destino**
Hoy los circuit breakers son por lead. Falta un tope agregado por número de origen (defensa ante 63018, que ya apareció 1 vez).
→ En `messaging/send.ts`, contador por `fromNumberId` en ventana móvil (Upstash/Redis o tabla). Si se supera, encolar en vez de enviar.

**3.10 Tracking por plantilla de delivered/read/blocked**
`whatsapp_templates` no registra métricas de salida. Sin esto no se sabe qué plantilla concentra los reportes (paso 2 de la checklist de apelación de Meta).
→ Webhook de status de Twilio → tabla `template_send_stats (logical_id, date, sent, delivered, read, failed, opt_out)`. Es la evidencia que pide Meta.

**3.11 Tope de reintentos por lead ya existe pero conviene un guardarraíl único**
Consolidar 3.2 + 3.9 + 3.10 en un módulo `src/lib/messaging/health.ts` que `send.ts` consulte una sola vez por envío: `{ suppressed, rateLimited, templateThrottled }`.

---

## 4. Hallazgos — plantillas

- 30 plantillas, todas `approved`, todas categoría de servicio/utility (re-engage, link reminder, ficha hogar, OTP). No hay MARKETING puro → **bien**, el opt-in inicial va como mensaje de sesión (usuario escribió primero), no como plantilla.
- `registration_instructions_confirm` (HX257d84…2080) figura `approved` en DB — coincide con la nota de memoria de que estaba pendiente; confirmar que la fila apunta al SID correcto.
- Ninguna plantilla de re-engage tiene botón de opt-out (ver 3.7).
- Contenido dinámico: `getOrCreateQuickReplyContent(text, …)` crea un Content resource por texto único de pregunta. Con ~40 preguntas está OK (cacheado en `twilio_content_cache`), pero si el texto de las preguntas cambia seguido se acumulan recursos huérfanos.

---

## 5. Plan sugerido (orden)

1. **Hoy:** abrir "Ver detalles" del aviso, leer la violación específica, y **no** apelar todavía.
2. **P0 código:** cerrar bug de firma del webhook (3.1) + lista de supresión por teléfono (3.2). Verificar `WHATSAPP_NUMBER_MAP` en prod (3.3).
3. **Bajar volumen del +1 786** 7–14 días (operativo, no código): pausar/reducir pauta hacia ese número.
4. **P1:** capturar CTWA (3.4), alinear saludo con creativo + diferir T&C (3.5), agrupar preguntas (3.6), botón de baja en nudges (3.7).
5. **Recalcular:** esperar a que la ventana móvil de calidad se recupere con menos volumen y menos bloqueos.
6. **Apelar** con evidencia concreta: qué plantilla/creativo concentraba reportes, qué se cambió, desde cuándo (usar datos de 3.4 y 3.10).
7. **P2:** módulo `messaging-health` unificado (3.9–3.11).

---

## Apéndice — consultas usadas

```sql
-- Funnel de abandono
select lead_status, count(*), round(avg(current_phase),1), round(avg(survey_question_index),1)
from leads where created_at > now() - interval '5 days' group by 1 order by 2 desc;

-- Leak check (0 filas = bien)
select count(*) from leads l join conversation_messages cm on cm.lead_id=l.id
where l.status_reason in ('user_freetext_opt_out','opt_in_decline','registration_user_decline')
and cm.direction='out' and cm.created_at > l.updated_at + interval '2 minutes';
```

Logs de Twilio: `scripts`-style pull vía REST `Messages.json?DateSent>=<-5d>` con paginación (37.387 msgs).
