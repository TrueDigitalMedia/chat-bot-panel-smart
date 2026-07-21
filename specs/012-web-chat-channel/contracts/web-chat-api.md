# Contract: `/api/chat/web`

Endpoint público (no cubierto por `middleware.ts`, que solo protege `/admin/*` y las rutas `/api/admin/*`, `/api/conversations/*`, `/api/evals/*` — ver research.md R9). No requiere autenticación, igual que cualquiera puede escribirle hoy al bot de Telegram o WhatsApp sin invitación previa.

## Cookie de sesión

Todas las respuestas de este endpoint, si el request no trae la cookie `web_session_id`, la fijan:

```
Set-Cookie: web_session_id=<uuid-v4>; HttpOnly; Secure; SameSite=Lax; Max-Age=63072000; Path=/
```

(`Max-Age` ≈ 2 años — persistencia indefinida per spec, research.md R1). El cliente nunca lee ni envía este valor manualmente; el navegador la adjunta automáticamente en cada `fetch()` al mismo origen.

## `GET /api/chat/web`

Bootstrap de la página: resuelve o crea el lead y devuelve el historial de mensajes para pintar el chat. Si es la primera vez que se ve esa cookie (lead recién creado, sin mensajes previos), dispara el arranque del bot (mismo mensaje de opt-in que un `/start` de Telegram) antes de devolver el historial.

**Response `200`**:
```json
{
  "leadId": "uuid",
  "leadStatus": "incomplete",
  "messages": [
    {
      "id": "uuid",
      "direction": "out",
      "contentType": "keyboard",
      "body": "¿Te gustaría inscribirte en PanelSmart y comenzar a ganar premios?",
      "meta": { "buttons": [{ "text": "Inscribirme", "callback_data": "optin:accept" }, { "text": "No", "callback_data": "optin:decline" }] },
      "createdAt": "2026-07-21T00:00:00.000Z"
    }
  ]
}
```

## `POST /api/chat/web`

Envía un mensaje del visitante y devuelve la(s) respuesta(s) del bot generadas en ese mismo turno (research.md R2 — procesamiento síncrono, sin `after()`).

**Body** (exactamente uno de `text`, `callbackData`, o `location`):
```json
{ "text": "Guatemala" }
```
```json
{ "callbackData": "optin:accept" }
```
```json
{ "location": { "latitude": 14.6349, "longitude": -90.5069 } }
```

- `400` si el body no trae ninguno de los tres campos, o trae más de uno.
- Si la cookie de sesión no existe todavía, se comporta como un `GET` implícito primero (crea el lead) antes de procesar el mensaje — evita que el cliente tenga que orquestar dos llamadas para el primer mensaje.

**Response `200`**:
```json
{
  "leadId": "uuid",
  "leadStatus": "incomplete",
  "messages": [
    {
      "id": "uuid",
      "direction": "out",
      "contentType": "text",
      "body": "¿Cuál es tu nombre completo?",
      "meta": null,
      "createdAt": "2026-07-21T00:00:05.000Z"
    }
  ]
}
```

Solo incluye los mensajes salientes **nuevos** generados durante este turno (no repite el historial completo — el cliente ya lo tiene del `GET` inicial y de turnos previos).

- `429` si se excede el rate limit (mismo umbral que el webhook de Telegram — 20 requests/60s por sesión, research.md R10).
- `500` en caso de error interno de procesamiento (`routeMessage` no debería lanzar en operación normal, pero el endpoint responde `500` genérico sin filtrar detalles internos si ocurre).

## Comportamiento reutilizado sin cambios de contrato

Estos endpoints no definen NINGUNA lógica de negocio propia — delegan 100% en `routeMessage`/`handlePhase1` (`src/lib/conversation/flow-router.ts`), igual que hacen hoy `POST /api/webhooks/telegram` y `POST /api/webhooks/whatsapp`. Cualquier cambio futuro a preguntas de la encuesta, scoring, cuotas, etc. aplica automáticamente al canal web sin tocar este contrato.
