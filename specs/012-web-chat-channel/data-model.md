# Data Model: Chat web (nuevo canal)

## Sin cambios de schema

Esta feature **no agrega ni modifica ninguna tabla ni columna**. Es una propiedad deliberada del diseño (research.md R1–R3): el canal `web` reutiliza entidades y columnas que ya existen y ya son genéricas por canal.

| Entidad existente | Cómo la usa el canal web |
|---|---|
| `leads.channel` (`channelEnum`, ya incluye `'web'` — `src/lib/db/schema.ts:70`) | Se guarda `'web'` para leads originados en el chat web, igual que `'telegram'`/`'whatsapp'` hoy. |
| `leads.channelUserId` | Para el canal web, es el UUID de la cookie de sesión del visitante (research.md R1) — mismo campo, mismo índice único `leads_channel_user_idx (channel, channel_user_id)` (`schema.ts:103`), sin cambios de constraint. |
| `leads.channelUsername` | No aplica a web (queda `null`) — no hay un "username" de navegador equivalente al de Telegram. |
| `conversation_messages` | Ya registra cada mensaje entrante y saliente por lead con su `channel` (`schema.ts:283`) — es el buzón de mensajes que el cliente web lee en el bootstrap (`GET`) y tras cada `POST` (research.md R2). Sin cambios de columnas. |
| `survey_profiles`, `flow_states`, `ficha_hogar_profiles`, `quota_targets`, etc. | Sin cambios — estas tablas ya operan sobre `leadId`, agnósticas de canal. Un lead del canal web pasa por exactamente el mismo modelo de datos de encuesta, scoring y cuotas que uno de Telegram/WhatsApp. |

## Entidad nueva (solo en memoria/cookie, no en DB)

- **Sesión de chat web**: el UUID v4 generado por el servidor y almacenado en la cookie `web_session_id` (`HttpOnly`, `Secure`, `SameSite=Lax`, ~2 años de vigencia). No tiene tabla propia — su único rol es ser el `channelUserId` que identifica al lead (ver tabla arriba). No se persiste en ningún lado más que la cookie del navegador del visitante.

## Contrato de datos entre el cliente web y `conversation_messages`

El cliente renderiza el chat directamente a partir de las filas de `conversation_messages` de ese lead, en orden cronológico:

| Campo de `conversation_messages` | Uso en el cliente |
|---|---|
| `direction` (`'in' \| 'out'`) | Determina si la burbuja se pinta como mensaje del visitante o del bot. |
| `content_type` (`'text' \| 'callback' \| 'contact' \| 'keyboard' \| 'video' \| 'system'`) | Determina cómo renderizar la burbuja — texto plano, botones (`'keyboard'`, usa `meta.buttons`), video, etc. |
| `body` | Texto del mensaje (o el `callback_data` recibido, para mensajes `direction='in'` de tipo `'callback'`). |
| `meta` | Para `content_type='keyboard'`: `{ buttons: [{ text, callback_data }] }` (research.md R4) — la lista de botones a pintar. |
| `created_at` | Orden cronológico y timestamp visible opcional. |

No se expone ningún otro campo de `leads`/`survey_profiles` al cliente web — el chat solo necesita el historial de mensajes, nunca el estado interno del lead (NSE, cupo, etc.), igual que un usuario de Telegram nunca ve esos datos internos.
