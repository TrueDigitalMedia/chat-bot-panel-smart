# Quickstart: Validar el chat web

## Prerrequisitos

- `send.ts` actualizado (research.md R7 — el caso `'web'` ya no lanza error).
- Endpoint `src/app/api/chat/web/route.ts` implementado (contracts/web-chat-api.md).
- Página `src/app/chat/page.tsx` implementada.

## 1. Primer contacto (bootstrap)

```bash
curl -i http://localhost:3000/api/chat/web
```

**Esperado**: `200`, header `Set-Cookie: web_session_id=...`, y en el body un primer mensaje saliente igual al opt-in inicial que hoy recibe un usuario nuevo de Telegram ("¿Te gustaría inscribirte en PanelSmart...").

## 2. Responder el opt-in

```bash
curl -i -b cookies.txt -c cookies.txt http://localhost:3000/api/chat/web  # guarda la cookie
curl -i -b cookies.txt -X POST http://localhost:3000/api/chat/web \
  -H 'Content-Type: application/json' \
  -d '{"callbackData":"optin:accept"}'
```

**Esperado**: `200` con el siguiente mensaje del flujo (D1 — términos y condiciones), igual que avanzaría un usuario de Telegram que toca "Inscribirme".

## 3. Continuar hasta la encuesta y verificar persistencia de sesión

Repetir `POST` con las respuestas correspondientes hasta llegar a una pregunta de texto libre de la encuesta (ver `src/lib/conversation/survey-questions.ts` para el orden). Luego:

```bash
curl -i -b cookies.txt http://localhost:3000/api/chat/web  # simula recargar la página
```

**Esperado**: el `GET` devuelve el historial completo hasta ese punto — el lead NO se reinicia (US2 del spec).

## 4. Validar el gate de ubicación

Cuando el flujo llegue al paso de GPS (después de confirmar que es shopper, D3):

```bash
curl -i -b cookies.txt -X POST http://localhost:3000/api/chat/web \
  -H 'Content-Type: application/json' \
  -d '{"location":{"latitude":14.6349,"longitude":-90.5069}}'
```

**Esperado**: el bot procesa la ubicación igual que el GPS compartido por Telegram/WhatsApp — confirma zona geográfica o pide confirmación de municipio (research.md R5).

## 5. Verificar en el navegador (UI)

```bash
yarn dev
```

Abrir `http://localhost:3000/chat`:
1. Confirmar que el chat carga sin sesión previa y muestra el opt-in inicial.
2. Completar la encuesta usando los botones y el input de texto de la página.
3. Al llegar al paso de ubicación, confirmar que el navegador pide permiso de geolocalización.
4. Recargar la página a mitad de la encuesta y confirmar que continúa en la misma pregunta (no reinicia).
5. Completar la encuesta hasta el resultado final y confirmar que se recibe el mismo tipo de mensaje de calificado/no calificado/cupo agotado que en los otros canales.

## 6. Confirmar visibilidad en el panel admin

1. Iniciar sesión en `/admin/conversations`.
2. Confirmar que la conversación de prueba del paso 5 aparece en la lista con canal `web`.
3. En `/admin/dashboard`, filtrar por canal `web` y confirmar que las métricas reflejan solo esa conversación.
