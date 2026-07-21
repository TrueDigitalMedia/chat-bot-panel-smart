# Implementation Plan: Chat web (nuevo canal)

**Branch**: `012-web-chat-channel` | **Date**: 2026-07-21 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/012-web-chat-channel/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

Agregar un canal de chat web público que reproduce, sin duplicarlo, el mismo motor de conversación que ya usan Telegram y WhatsApp (`routeMessage`/`handlePhase1`). Enfoque técnico: una cookie de sesión anónima hace de identidad del visitante (reutilizando `upsertLead` tal cual), un nuevo endpoint `/api/chat/web` procesa cada turno de forma síncrona y devuelve la respuesta del bot en el mismo request/response (en vez del patrón webhook-fire-and-forget de los otros canales), y `conversation_messages` — que ya registra cada mensaje saliente de cualquier canal — hace de buzón de mensajes que el cliente lee. Cero cambios de schema. Ver research.md para el detalle de cada decisión.

## Technical Context

**Language/Version**: TypeScript 5 (strict mode), Node.js — sin cambios respecto al resto del proyecto.

**Primary Dependencies**: Next.js 16.2 (App Router), React 19.2, Tailwind CSS 4 (ya dependencias — la página nueva las usa para su UI). Vercel AI SDK (`ai` 7, `@ai-sdk/openai` 4) ya presente pero no se usa como motor del chat (research.md R9 — el canal web no genera respuestas vía streaming de un modelo, reutiliza el mismo motor de reglas/estado que ya responde por Telegram/WhatsApp).

**Storage**: PostgreSQL (Neon) vía Drizzle — sin migraciones nuevas (data-model.md: cero cambios de schema).

**Testing**: Vitest (unit — nuevo `tests/unit/web-chat-api.test.ts` y similares), Playwright (e2e — nuevo `tests/e2e/web-chat.spec.ts`, siguiendo el patrón ya usado por `tests/e2e/phase-1-qualify.spec.ts`).

**Target Platform**: Vercel (edge/serverless) — la página y el endpoint son parte de la misma app Next.js ya desplegada; sin servicios nuevos.

**Project Type**: Web application (Next.js single-project, ya establecido).

**Performance Goals**: El endpoint `POST /api/chat/web` responde en el mismo rango de latencia que ya toma `routeMessage` hoy dentro del `after()` de los webhooks (típicamente <2s por turno, dominado por las llamadas LLM de extracción cuando aplican) — ahora esa misma latencia queda expuesta directamente al visitante en el request/response en vez de ser invisible tras un webhook async.

**Constraints**: Debe funcionar sin conexiones persistentes (sin WebSocket/SSE) para encajar en el modelo serverless de Vercel — ver research.md R2.

**Scale/Scope**: Un canal adicional sobre el mismo sistema multi-canal existente (Telegram + WhatsApp + Web); mismo volumen de tráfico esperado que un canal más, sin cambios de escala en la base de datos.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. AI Safety & Guardrails** — El chat web no introduce un nuevo punto de generación de LLM; reutiliza las mismas validaciones de input y las mismas llamadas LLM de extracción/FAQ ya existentes y ya guardadas. Rate limiting aplicado en `/api/chat/web` con el mismo patrón que el webhook de Telegram (research.md R10). ✅ PASS.
- **II. Observability First** — Cada mensaje entrante/saliente del canal web queda registrado en `conversation_messages` exactamente igual que los otros canales (misma tabla, mismo `logConversationMessage`/`logOut`) — sin pérdida de trazabilidad. ✅ PASS.
- **III. Simplicity / YAGNI** — Se reutiliza `upsertLead`, `routeMessage`, `conversation_messages` y el shape existente de `ChannelInbound.location` sin ningún cambio de schema ni tabla nueva; se evita explícitamente adoptar el backend completo de `chat-sdk.dev` (que duplicaría la lógica de conversación en un segundo sistema) — solo se toman sus patrones de UI (research.md R9). No se introduce WebSocket/SSE sin necesidad demostrada (research.md R2/R8). ✅ PASS.
- **IV. Flexible Quota Eligibility** — No aplica ningún cambio a la lógica de cuotas; un lead del canal web pasa por el mismo `checkQuotaAvailability` sin distinción de canal. ✅ PASS (no aplica, sin cambios).

**Resultado**: Sin violaciones. No se requiere Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/012-web-chat-channel/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/
│   └── web-chat-api.md
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

Proyecto único Next.js (App Router) ya establecido — sin nuevos servicios ni proyectos. Archivos nuevos y modificados:

```text
src/app/chat/
├── page.tsx                               # NUEVO: página pública del chat web (Tailwind), fuera de /admin
├── chat-window.tsx                        # NUEVO: componente cliente — lista de mensajes, composer, manejo de botones/ubicación
└── chat.module.css o Tailwind inline       # NUEVO: estilos de la UI del chat

src/app/api/chat/web/
└── route.ts                                # NUEVO: GET (bootstrap) + POST (turno), ver contracts/web-chat-api.md

src/lib/messaging/
└── send.ts                                 # MODIFICAR: caso 'web' deja de lanzar error en sendText/sendVideo/
                                             #   sendInlineKeyboard/sendPhoneRequest/sendLocationRequest (research.md R7)

src/lib/web/
└── session.ts                              # NUEVO: helpers de la cookie web_session_id (generar/leer, research.md R1)

tests/unit/
├── web-chat-session.test.ts                # NUEVO: helpers de cookie de sesión
└── web-chat-send-adapter.test.ts           # NUEVO: casos 'web' de send.ts ya no lanzan, sí loguean

tests/e2e/
└── web-chat.spec.ts                        # NUEVO: bootstrap + turno completo contra /api/chat/web (smoke, mismo estilo que phase-1-qualify.spec.ts)
```

Sin cambios en: `src/lib/conversation/*`, `src/lib/scoring/*`, `src/lib/quotas/*`, `src/lib/db/schema.ts`, `src/app/admin/*` — el canal web es puramente una nueva puerta de entrada/salida sobre el motor y el panel admin ya existentes (data-model.md, research.md R3).

**Structure Decision**: Se mantiene la estructura de proyecto único ya establecida. La página pública vive en `src/app/chat/` (hermana de `src/app/admin/`, no dentro de ella) para quedar fuera del `matcher` de `middleware.ts` sin tener que tocarlo. El endpoint vive en `src/app/api/chat/web/` (no bajo `src/app/api/webhooks/`) para reflejar que no es un receptor pasivo de un proveedor externo, sino un endpoint de chat directo (research.md R3).

## Complexity Tracking

*Sin violaciones — Constitution Check pasa sin excepciones (ver arriba). Tabla vacía intencionalmente.*
