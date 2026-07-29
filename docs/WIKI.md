# Wiki: PanelSmart Recruitment Bot

> Última actualización: 2026-07-29 (spec 012: chat web, integración Panel Smart & QStash recurring schedule — ver §12 y §13; configuración WhatsApp — ver §14)

---

## Índice

1. [Visión general del proyecto](#1-visión-general-del-proyecto)
2. [Stack tecnológico](#2-stack-tecnológico)
3. [Arquitectura del sistema](#3-arquitectura-del-sistema)
4. [Flujo de conversación (Fases)](#4-flujo-de-conversación-fases)
5. [Flujo de preguntas actualizado (Preguntas CAM)](#5-flujo-de-preguntas-actualizado-preguntas-cam)
6. [Fórmula de Scoring SCL-CAM (Kantar Worldpanel)](#6-fórmula-de-scoring-scl-cam-kantar-worldpanel)
7. [Gaps entre la fórmula SCL-CAM y la implementación actual](#7-gaps-entre-la-fórmula-scl-cam-y-la-implementación-actual)
8. [Sistema de cuotas actual (Kantar Quotas Test)](#8-sistema-de-cuotas-actual-kantar-quotas-test)
   - 8.1 [Cuotas flexibles por dimensión (2026-07-20)](#81-cuotas-flexibles-por-dimensión-2026-07-20)
9. [Plan: Panel Administrativo de Cuotas](#9-plan-panel-administrativo-de-cuotas)
10. [Plan: Dashboard de Leads](#10-plan-dashboard-de-leads)
11. [Estado de implementación por feature](#11-estado-de-implementación-por-feature)
12. [Chat web (canal nuevo)](#12-chat-web-canal-nuevo)
13. [Integración Panel Smart & Kantar (2026-07-29)](#13-integración-panel-smart--kantar-2026-07-29)
14. [Configuración de WhatsApp (Canal)](#14-configuración-de-whatsapp-canal)

---

## 1. Visión general del proyecto

**PanelSmart Recruitment Bot** es un chatbot multicanal (Telegram + WhatsApp) que recluta panelistas para Kantar Worldpanel en la región CAM (Centroamérica + Rep. Dominicana) y potencialmente México y Ecuador.

El bot conduce al usuario a través de un flujo de calificación, calcula su nivel socioeconómico (SCL), verifica si hay cupo disponible en su segmento/región, y en caso afirmativo lo incorpora a la app PanelSmart.

**Repositorio:** `chat-bot-ai` (Next.js 16, TypeScript, Drizzle ORM + Neon/Postgres)  
**Deploy:** Vercel — `https://chat-ai-panel.vercel.app`  
**Base de datos:** PostgreSQL (Neon serverless) con pgvector para FAQ embeddings

---

## 2. Stack tecnológico

| Capa | Tecnología |
|------|-----------|
| Framework | Next.js 16 (App Router) |
| Lenguaje | TypeScript 5 |
| Base de datos | PostgreSQL (Neon serverless) via Drizzle ORM |
| IA / LLM | OpenAI GPT (via Vercel AI SDK `@ai-sdk/openai`) |
| Cola de tareas | Upstash QStash (re-engagement jobs) |
| Canal Telegram | Bot API (webhook) |
| Canal WhatsApp | Meta Cloud API + Twilio (dual provider) |
| Testing unitario | Vitest |
| Testing E2E | Playwright |
| Reverse geocoding | API interna + catálogo NSE-GEO CAM |
| UI del área admin | Tailwind CSS + shadcn/ui (spec `009-admin-login-sidebar`; el resto de páginas sigue usando CSS Modules) |

---

## 3. Arquitectura del sistema

```
Usuario (Telegram / WhatsApp)
        ↓
  Webhook Handler (/api/webhooks/telegram | /api/webhooks/whatsapp)
        ↓
  flow-router.ts → routeMessage()
        ↓
  ┌─────────────────────────────────────────────────┐
  │  Phase 1: Decision Points + 23 Survey Questions │
  │  Phase 2: Envío links descarga app              │
  │  Phase 3: Confirmación registro en app          │
  │  Phase 4: Ficha Hogar + Summary AI              │
  └─────────────────────────────────────────────────┘
        ↓
  Scoring SCL-CAM → checkQuotaAvailability()
        ↓
  DB: leads + survey_profiles + flow_states
        ↓
  Treinta panelist record + embedding (pgvector)
```

### Tablas principales en la DB

- **`leads`**: estado del lead, canal, score NSE, segmento de cuota, fases
- **`survey_profiles`**: respuestas completas del cuestionario
- **`flow_states`**: estado granular de la conversación (GPS gate, correcciones, FAQ digressions)
- **`re_engagement_schedules`**: jobs de re-engagement programados vía QStash
- **`faq_entries`**: base vectorial para responder preguntas frecuentes
- **`treinta_panelist_records`**: snapshot del panelista para sistema Treinta
- **`conversation_messages`**: log completo de mensajes in/out
- **`conversation_evals`**: resultados de evaluaciones QA automatizadas
- **`system_call_logs`**: logs de llamadas a la API de IA (tokens, latencia)

### Estados del lead (State Machine)

```
incomplete
  ├─→ not_qualified        (D1 decline / D2 decline / D3 no)
  ├─→ quota_exhausted      (D3 no / sin cupo tras encuesta)
  └─→ link_sent            (encuesta completa + cupo disponible)
        └─→ waiting_for_code
              ├─→ code_delivered_registered
              │     └─→ ficha_hogar_completada  ✅ (terminal)
              ├─→ code_delivered_not_registered  (terminal)
              └─→ code_delivered_no_response     (terminal)
```

---

## 4. Flujo de conversación (Fases)

### Fase 1 — Calificación + Encuesta

**Decision Points (D1 / D2 / D3):**

| Paso | Pregunta | Acción si rechaza |
|------|----------|-------------------|
| D1 | Aceptación de T&C | → `not_qualified` |
| D2 | ¿Quieres ganar premios? | → `not_qualified` |
| D3 | ¿Eres quien organiza las compras? | → `quota_exhausted` |

Tras pasar D3: captura de teléfono (Telegram/web) → GPS gate → 23 preguntas de encuesta.

Al finalizar la encuesta: cálculo de score SCL → verificación de cuota → si hay cupo avanza a Fase 2.

### Fase 2 — Descarga de app

Envía links de descarga (iOS / Android). Programa un job para enviar el código de registro.

### Fase 3 — Registro en app

Confirma que el usuario se registró. Si sí → Fase 4. Si no → soporte.

### Fase 4 — Ficha Hogar

Cuestionario interactivo de 7 preguntas (conflicto de interés, internet, parentesco, fecha nacimiento, condición salud, plan datos, mascotas) — ✅ implementado en `specs/008-ficha-hogar-interactive`. Una respuesta "Sí" a conflicto de interés descarta al panelista (`ficha_hogar_descartado`). Al completar las 7 preguntas, genera resumen AI (con datos combinados de `survey_profiles` + `ficha_hogar_profiles`) y persiste el panelista en el sistema Treinta. Transición final → `ficha_hogar_completada`. Incluye menú de corrección propio (`ficha-hogar-correction.ts`).

---

## 5. Flujo de preguntas actualizado (Preguntas CAM)

El archivo `docs/Preguntas_Kantar_CAM_Ecuador_México (MX Y EC TBD).xlsx`, hoja **"Preguntas CAM"**, define el flujo oficial actualizado con **23 preguntas** en Fase 1 y **7 preguntas** en Fase 4.

### FASE 1 — Preguntas de calificación y encuesta

| # | Pregunta | Respuestas / Tipo | Notas |
|---|----------|------------------|-------|
| 1 | ¿Te gustaría inscribirte en PanelSmart y comenzar a ganar premios? | Inscribirme / No | **NUEVO** — no está implementado |
| 2 | Confirma T&C (link panelsmart-cenam.com) | Confirmo y acepto / No, gracias | = D1 actual |
| 3 | ¿Quieres ganar premios por decirnos qué compras? | Sí quiero / No, gracias | = D2 actual |
| 4 | ¿Eres quien administra y organiza las compras del hogar? | Sí / No | = D3 actual |
| 5 | ¿Cuál es tu nombre y apellido? | Texto libre | = Q1 actual |
| 6 | ¿En qué país te encuentras? | Panamá, CR, HN, SV, GT, RD, NI | = Q2 actual |
| 7 | ¿En qué provincia o departamento vives? | Geo Kantar | = Q3 actual |
| 8 | ¿En qué cantón o municipio vives? | Geo Kantar | = Q4 actual |
| 9 | ¿En qué parroquia, barrio o distrito vives? | Geo Kantar | = Q5 actual |
| 10 | ¿Cuál es tu correo electrónico? | Texto libre | = Q6 actual |
| 11 | ¿Cuál es tu género? | Masculino / Femenino | = Q7 actual (opción Femenino reemplaza Mujer) |
| 12 | ¿Cuántos años cumplidos tienes? | Texto libre | **NUEVO** — cuota extra, NO influye en NSE |
| 13 | ¿Cuál es el nivel educativo del PSH? | 12 niveles (ver scoring) | = Q8 actual (opciones expandidas) |
| 14 | ¿Cuántos autos dispone regularmente este hogar? | 0 / 1 / 2 o más | = Q9 actual |
| 15 | ¿Este hogar cuenta actualmente con apoyo de servicio doméstico? | No / Sí | = Q10 actual |
| 16 | ¿Cuántas personas residen habitualmente en este hogar? | Numérico | = Q11 actual — **SÍ influye en cálculo NSE** |
| 17 | ¿Te encuentras actualmente embarazada? | Sí / No | **NUEVO** — cuota extra, NO influye en NSE |
| 18 | ¿Vive usted con un bebé menor de 3 años? | Sí / No | **NUEVO** — cuota extra, NO influye en NSE |
| 19 | ¿Cuántas habitaciones están destinadas exclusivamente para dormir? | Numérico | = Q12 actual — influye en NSE (HACI) |
| 20 | ¿Con qué frecuencia realizas las compras para el hogar? | Diario / 2-3x semana / Semanal / Quincenal / Mensual | = Q13 actual |
| 21 | ¿Cuáles categorías compras en una semana típica? | Multiselección 8 categorías | = Q14 actual |
| 22 | ¿Cómo te gustaría ser contactado/a? | WhatsApp / Llamada telefónica | = Q15 actual |
| 23 | ¿En qué horario del día puedes ser contactado/a? | Mañana / Tarde / Noche | = Q16 actual |

**Preguntas NUEVAS — ✅ implementadas** en `specs/007-fase1-new-survey-questions`: #1 (bienvenida/opt-in, ahora un decision point antes de D1), #12 (edad), #17 (embarazo), #18 (bebé < 3 años). Nota: internamente el bot pregunta edad/embarazo/bebé **al final** de la encuesta (índices 17-19), no en la posición #12/#17/#18 exacta del Excel — se decidió así para no romper conversaciones en curso al desplegar (ver `research.md` R1 de esa spec). El opt-in sí es la primera interacción, como pide el Excel.

### FASE 2/3 — Descarga y registro en app

El flujo de la hoja incluye: envío de links de descarga, video instructivo, entrega del código de registro, y confirmación de registro. La lógica actual cubre esto con las fases 2 y 3 (modo mock).

### FASE 4 — Ficha Hogar (nuevas preguntas)

| # | Pregunta | Respuestas |
|---|----------|-----------|
| 1 | ¿Trabajas tú o alguien en tu hogar en publicidad/investigación/medios/industria alimentaria? | Sí / No — **DESCARTE de panelista** |
| 2 | ¿Tienen acceso a internet en tu hogar? | Sí / No |
| 3 | ¿Cuál es tu parentesco con el Jefe de Familia? | JF / Cónyuge / Hijo/a / Padre/Madre / otro |
| 4 | ¿Cuál es tu fecha de nacimiento? (DD/MM/AAAA) | Texto libre |
| 5 | ¿Tienes alguna condición de salud permanente que no te permita contestar estudios? | Sí / No |
| 6 | ¿Tu smartphone cuenta con un plan de datos móviles ilimitado? | Sí / No |
| 7 | ¿Cuántas mascotas (perros y/o gatos) hay en tu hogar? | Numérico |

**✅ implementado** en `specs/008-ficha-hogar-interactive`: las 7 preguntas ahora son un cuestionario interactivo (motor de estado propio en `ficha_hogar_profiles`, paralelo al de Fase 1). La pregunta #1 (conflicto de interés) actúa como gate de descarte. Al completarse las 7, el resumen AI y el registro Treinta incluyen estos datos combinados con los de `survey_profiles`.

---

## 6. Fórmula de Scoring SCL-CAM (Kantar Worldpanel)

> Fuente: `docs/SCL-CAM.pdf` — Equipo estadístico México - CAM, Kantar Worldpanel

El scoring combina **4 dimensiones** con pesos específicos para dar un puntaje total de 0–100 (normalizado).

### Fórmula final

```
SCL = (45 × Puntos_NiPSH + 18 × Puntos_HACI + 28 × Puntos_AUTO + 9 × Puntos_SD) / 100
```

### Dimensión 1: NiPSH — Nivel educativo del Principal Sostén del Hogar

| Código | Descripción | Puntos |
|--------|-------------|--------|
| 1 | No alfabetizado | 0 |
| 2 | Alfabetizado pero no en escuela normal | 0 |
| 3 | Primaria Incompleta | 0 |
| 4 | Primaria Completa | 0 |
| 5 | Secundaria Incompleta | 250 |
| 6 | Secundaria Completa | 250 |
| 7 | Bachillerato Incompleto | 250 |
| 8 | Bachillerato Completo | 400 |
| 9 | Universidad Incompleta | 900 |
| 10 | Universidad Completa | 1000 |
| 11 | Pos Grado Incompleto | 1000 |
| 12 | Pos Grado Completo | 1000 |

Peso en fórmula final: **×45**

### Dimensión 2: HACI — Hacinamiento (personas por dormitorio)

**Fórmula intermedia:** `HACI = (10 × Número de personas en el hogar) / Número de dormitorios exclusivos`

Si el hogar no tiene dormitorios exclusivos → `HACI = 99`

| HACI | Descripción | Puntos |
|------|-------------|--------|
| ≥ 25 | Muy hacinado (incluye HACI=99) | 0 |
| > 15 y < 25 | Hacinado | 250 |
| ≥ 10 y ≤ 15 | Moderado | 500 |
| < 10 | Sin hacinamiento | 1000 |

Peso en fórmula final: **×18**

### Dimensión 3: AUTO — Número de automóviles particulares

| Cantidad | Descripción | Puntos |
|----------|-------------|--------|
| 0 | No posee auto | 0 |
| 1 | Un auto | 650 |
| 2 o más | Dos o más autos | 1000 |

Peso en fórmula final: **×28**

### Dimensión 4: SD — Servicio Doméstico

| Cantidad | Descripción | Puntos |
|----------|-------------|--------|
| 0 | No cuenta con servicio doméstico | 0 |
| 1 | Uno o más (incluye cualquier tipo, aunque sea por horas) | 1000 |

Peso en fórmula final: **×9**

### Clasificación en niveles socioeconómicos (NSE)

| Puntaje SCL | Nivel |
|-------------|-------|
| ≥ 540 | **Alto (1)** |
| > 325 y < 540 | **Medio-Alto (2)** |
| > 180 y ≤ 325 | **Medio-Bajo (3)** |
| ≤ 180 | **Bajo (4)** |

> Los segmentos que usa Kantar en CAM son: **Nivel 1, Nivel 2, Nivel 3, Nivel 4**.
> En México: **AB, C+, C, D+, D/E**. En Ecuador: **A, B, C, D, E**.

---

## 7. Gaps entre la fórmula SCL-CAM y la implementación actual

> **✅ Secciones 7.1–7.5 resueltas** por `specs/004-scl-cam-scoring-fix`, `specs/005-quota-admin-panel`, `specs/007-fase1-new-survey-questions` y `specs/008-ficha-hogar-interactive`. Se conserva el contenido original como referencia histórica de por qué se hizo el cambio.

### 7.1 Fórmula de scoring (`src/lib/scoring/socioeconomic.ts`) — ✅ RESUELTO

La implementación **anterior** no seguía la fórmula oficial de Kantar; corregido en `specs/004-scl-cam-scoring-fix`. Usa una escala arbitraria de 0–100 con pesos inventados. Los problemas específicos son:

| Aspecto | Fórmula Kantar (correcta) | Implementación actual (incorrecta) |
|---------|--------------------------|-------------------------------------|
| **Escala de puntos NiPSH** | 12 niveles con valores 0/250/400/900/1000 | 10 niveles lineales 0–9 (×4) |
| **Pesos de dimensiones** | 45×NiPSH + 18×HACI + 28×AUTO + 9×SD, dividido 100 | Sin pesos documentados |
| **Cálculo HACI** | `(10 × personas) / dormitorios`, luego en escala 0–1000 | `max(0, 15 - size×2)` — fórmula diferente |
| **SD (servicio doméstico)** | 0 → 0 pts / 1+ → 1000 pts | `domesticHelp ? 10 : 0` (escala diferente) |
| **AUTO** | 0→0, 1→650, 2+→1000 pts | 0→0, 1→3, 2+→5 pts |
| **Clamp final** | División /100 normalizada | `Math.min(100, score)` |
| **Umbral NiPSH** | "Sin instrucción formal", "Alfabetizado no escolar", Primaria Incompleta/Completa → todos 0 pts | Todos mapeados 0–1 lineal |
| **Segmentos de salida** | Nivel 1/2/3/4 (CAM) | A/B, C+, C, D+, D/E |

**Las opciones del cuestionario también difieren:**

El PDF y el Excel actualizado tienen 12 opciones para educación del PSH, incluyendo:
- "No alfabetizado" y "Alfabetizado pero no en escuela normal" (ambos = 0 pts)

La implementación actual tiene 10 opciones sin esos dos niveles base y sin "Pos Grado Incompleto".

### 7.2 Cuota mock vs. cuota real — ✅ RESUELTO

`src/lib/scoring/quota.ts` **era** un stub (50/50 aleatorio). Ahora consulta la tabla `quota_targets` (objetivo real vs. leads calificados) — ver `specs/005-quota-admin-panel`.

### 7.3 Nombres de segmentos — ✅ RESUELTO

El código usaba `A/B, C+, C, D+, D/E` (México); ahora usa `Nivel 1, 2, 3, 4` (CAM) — ver `specs/004-scl-cam-scoring-fix`.

### 7.4 Preguntas faltantes en el flujo — ✅ RESUELTO

Las siguientes preguntas del Excel actualizado, antes ausentes, ya están implementadas:

- **P1 (Fase 1):** Opt-in inicial "¿Te gustaría inscribirte en PanelSmart?" — `specs/007-fase1-new-survey-questions`
- **P12 (Fase 1):** Edad del encuestado (cuota extra) — `specs/007-fase1-new-survey-questions`
- **P17 (Fase 1):** ¿Embarazada? (cuota extra) — `specs/007-fase1-new-survey-questions`
- **P18 (Fase 1):** ¿Bebé < 3 años? (cuota extra) — `specs/007-fase1-new-survey-questions`
- **Fase 4 completa:** 7 preguntas de Ficha Hogar, ahora interactivas — `specs/008-ficha-hogar-interactive`

### 7.5 Opción de género — ✅ RESUELTO

El Excel actualizado usa **Masculino/Femenino**; el código usaba **Hombre/Mujer** — corregido en `specs/004-scl-cam-scoring-fix`.

---

## 8. Sistema de cuotas actual (Kantar Quotas Test)

> ⚠️ **Superado desde 2026-07-20.** La regla de matching descrita en esta sección (país + región + NSE deben coincidir simultáneamente) queda reemplazada por el modelo de **cuotas flexibles por dimensión** — ver [§8.1](#81-cuotas-flexibles-por-dimensión-2026-07-20). Esta sección se conserva como referencia histórica del diseño original (`specs/005-quota-admin-panel`).

El archivo `docs/Kantar Quotas Test.xlsx` contiene las cuotas objetivo por país, región y nivel socioeconómico.

### Estructura del archivo

Tiene 3 hojas: **CAM**, **Mexico**, **Ecuador**.

Cada hoja tiene columnas: `REGIÓN | [NSE]: Objetivo | Conseguidos | Disponibles`

### Hoja CAM (activa en el bot)

4 niveles NSE: **Nivel 1 / Nivel 2 / Nivel 3 / Nivel 4**

Regiones y estado actual (al momento del análisis):

| País / Región | Nivel 1 (Obj/Cons) | Nivel 2 (Obj/Cons) | Nivel 3 (Obj/Cons) | Nivel 4 (Obj/Cons) |
|--------------|--------------------|--------------------|--------------------|--------------------|
| Costa Rica - AM II | 0/0 | 46/1 | 42/1 | 78/2 |
| Costa Rica - Norte | 26/1 | 26/0 | 52/3 | 115/1 |
| Costa Rica - Sur Occ. | 26/0 | 26/0 | 52/3 | 115/0 |
| El Salvador - NorOriente | 0/0 | 41/5 | 0/0 | 102/7 |
| El Salvador - Occidente | 0/0 | 45/5 | 20/6 | 173/10 |
| Guatemala - NorOriente | 0/0 | 0/0 | 60/2 | 100/2 |
| Guatemala - Resto Centro | 0/0 | 50/0 | 50/1 | 74/1 |
| Guatemala - Sur Occ. Chico | 0/0 | 50/4 | 50/1 | 97/2 |
| Guatemala - Sur Occ. Grande | 0/0 | 0/0 | 30/5 | 74/2 |
| Honduras - Nor Occ. I | 0/0 | 0/0 | 0/0 | 75/6 |
| Honduras - Nor Occ. II | 0/0 | 0/0 | 30/2 | 75/1 |
| Honduras - Sur Oriente | 0/0 | 0/0 | 35/6 | 75/3 |
| Nicaragua - Norcentral | 0/0 | 24/5 | 33/2 | 71/8 |
| Nicaragua - Occidente | 0/0 | 24/4 | 33/4 | 71/6 |
| Panama - Norte | 0/0 | 73/2 | 73/0 | 73/1 |
| Panama - Occidente | 0/0 | 20/4 | 82/3 | 88/2 |
| RD - Cibao | 0/0 | 165/1 | 40/0 | 85/2 |
| RD - Santo Domingo + DN | 0/0 | 0/0 | 110/10 | 0/0 |
| RD - Sureste | 0/0 | 46/8 | 50/2 | 64/6 |
| RD - Suroeste | 0/0 | 100/2 | 150/0 | 109/4 |
| **TOTAL** | **52/1** | **736/41** | **992/51** | **1714/66** |

**Totales globales CAM:** Objetivo = 3494 leads | Conseguidos = 159 | Disponibles = 3335

### Hoja Mexico

5 niveles: **AB, C+, C, D+, D/E** — por región (NORESTE, NOROESTE, TIJUANA, SURESTE, GUADALAJARA). Total: 402 leads objetivo, 0 conseguidos.

### Hoja Ecuador

5 niveles: **A, B, C, D, E** — por región (Costa Norte, Costa Sur, Guayaquil Sur, Quito Norte/Sur, Santo Domingo, etc.). Total: 146 leads objetivo, 0 conseguidos.

---

## 8.1 Cuotas flexibles por dimensión (2026-07-20)

> ✅ **Implementado** en `specs/011-flexible-quota-matching`. `quota_targets` ahora usa `dimension_type`/`dimension_value` (NSE, edad, integrantes) en vez de un único `nse_level`; nueva tabla `quota_region_caps` para el tope agregado manual por región; `leads.quota_matched_dimension`/`quota_matched_value` registran qué condición calificó a cada lead. Ver [Principio IV de la constitution](/.specify/memory/constitution.md), `specs/011-flexible-quota-matching/data-model.md` y `contracts/quota-check-contract.md`.

### Qué cambia respecto al modelo anterior (§8)

Hoy la elegibilidad exige que **país + región + NSE** coincidan a la vez contra una única fila de `quota_targets` (`specs/005-quota-admin-panel`). El negocio pidió flexibilizar esto para todos los países:

1. **Matching OR por dimensión, no AND combinado.** Un lead califica si cumple **al menos una** condición de cuota disponible entre sus dimensiones — NSE, edad, o tamaño de hogar — dentro de su región. Ya no es necesario que todas coincidan al mismo tiempo.
2. **Todas las regiones están abiertas.** Se puede reclutar de cualquier región, siempre que cumpla alguna de las condiciones requeridas.
3. **Excepción sin límite: embarazo o bebé 0-36 meses.** Si el hogar tiene una embarazada o un bebé de hasta 36 meses, el lead califica como panelista sin importar NSE, edad o integrantes, y sin tope de cuota.
4. **Tope agregado por región.** Para evitar saturar una sola región, cada región debe tener un límite máximo agregado de leads que bloquee nuevos registros al alcanzarse, incluso si alguna dimensión individual (NSE/edad/integrantes) sigue con cupo disponible. El valor exacto de este tope se define en el spec.

### Estructura de datos (por celda, no por combinación)

Confirmado con los archivos fuente adjuntos por el negocio: `docs/Muestra Faltante por País Julio 2026_True.xlsx` (una hoja por país; filas = región, columnas = celdas de cuota independientes) y `docs/Muestra Regiones NSE CAM.xlsx` (catálogo departamento/municipio → región, mismo catálogo que ya usa `data/geo/cam-nse-regions.json`).

Columnas de la hoja por país (ejemplo Honduras):

| Región | SCL1 | SCL2 | SCL3 | SCL4 | Embarazadas y bebés Hasta 36m | Hasta 34 | 35 a 49 | 50+ | 1 a 2 | 3 a 4 | 5+ |
|---|---|---|---|---|---|---|---|---|---|---|---|

Cada celda es un cupo independiente (leads faltantes para esa condición en esa región); la columna de embarazadas/bebés no lleva tope.

### Ejemplos (del negocio, verificados contra el Excel)

- **Honduras – Nor Occidente I** — SCL1=0, SCL2=0, SCL3=0, 50+=0 (sin cupo), pero **5+ integrantes = 22** (con cupo) → el lead califica por la condición de integrantes, aunque no cumpla NSE ni edad.
- **Honduras – Centro I** — 35 a 49 años=0, 3 a 4 integrantes=0 (sin cupo), pero **SCL4 = 16** (con cupo) → el lead califica por NSE, aunque las demás características no coincidan.
- **RD – Suroeste** — SCL1 no tiene cupo (0), pero un usuario de hasta 34 años sí puede calificar mientras esa cuota de edad tenga cupo disponible; si esa cuota de edad se agota, el mismo tipo de usuario aún puede calificar si su hogar tiene 5+ integrantes (cuota de integrantes con cupo).

### Fuente de datos

Reemplaza a `docs/Kantar Quotas Test.xlsx` (§8) como insumo de cuotas:

- `docs/Muestra Faltante por País Julio 2026_True.xlsx` — cuotas faltantes por país/región/dimensión (hojas: Dominicana, Costa Rica, El Salvador, Guatemala, Honduras, Nicaragua, Panamá, Ecuador, México)
- `docs/Muestra Regiones NSE CAM.xlsx` — catálogo departamento/municipio → región por país

---

## 9. Plan: Panel Administrativo de Cuotas

> **✅ Implementado** en `specs/005-quota-admin-panel` (`/admin/quotas`, tabla `quota_targets`, import/export Excel, Basic Auth). El contenido de esta sección es el plan original — el diseño final está en `specs/005-quota-admin-panel/data-model.md` y `contracts/admin-quotas-api.md`, y difiere en un punto: la nomenclatura de región usa los nombres exactos del catálogo geográfico (`data/geo/cam-nse-regions.json`), no un texto libre, para evitar cuotas que nunca puedan coincidir con leads reales.

### Objetivo

Reemplazar el archivo Excel con una interfaz web dentro del propio proyecto Next.js que permita definir, visualizar y actualizar los objetivos de leads por país, región y nivel socioeconómico.

### Modelo de datos propuesto

```sql
-- Nueva tabla: quota_targets
CREATE TABLE quota_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  country VARCHAR(50) NOT NULL,         -- 'Guatemala', 'Costa Rica', etc.
  region VARCHAR(100) NOT NULL,         -- 'Guatemala - Centro I', etc.
  nse_level VARCHAR(20) NOT NULL,       -- 'Nivel 1', 'Nivel 2', 'Nivel 3', 'Nivel 4'
  target_count INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE(country, region, nse_level)
);

-- Vista calculada (o query): quota_progress
-- Cruza quota_targets con leads reales para calcular conseguidos/disponibles
```

El campo `quota_segment` de la tabla `leads` debe cambiar de `A/B, C+, C, D+, D/E` a `Nivel 1, Nivel 2, Nivel 3, Nivel 4` para CAM (y mantener los segmentos MX/EC para esos países).

### Páginas y rutas sugeridas

```
/admin                          → Dashboard general (resumen por país)
/admin/quotas                   → Tabla editable de cuotas (CRUD)
/admin/quotas/[country]         → Vista de cuotas por país
/admin/quotas/import            → Import desde Excel (migración inicial)

API Routes:
GET  /api/admin/quotas          → Lista todas las cuotas
POST /api/admin/quotas          → Crea cuota
PUT  /api/admin/quotas/[id]     → Actualiza objetivo
GET  /api/admin/quotas/progress → Cuotas + leads conseguidos (join)
```

### Funcionalidades del panel

1. **Vista de tabla** por país y región con columnas: Objetivo | Conseguidos | Disponibles | % Avance
2. **Edición inline** del objetivo para cada celda región × NSE
3. **Importar desde Excel** (migración inicial desde `Kantar Quotas Test.xlsx`)
4. **Exportar a Excel** para reportes a Kantar
5. **Activar/desactivar regiones** (cuando una región cierra cuota)
6. **Historial de cambios** de objetivos (audit log)
7. **Autenticación básica** (middleware Next.js, variable de entorno `ADMIN_PASSWORD`)

### Integración con el bot

El bot (`checkQuotaAvailability`) debe dejar de ser un mock y consultar la tabla `quota_targets` comparándola contra el count real de `leads` con `lead_status = 'link_sent'` o superior, filtrando por `quota_segment` y `nse_region`.

```typescript
// Nueva implementación de quota.ts
export async function checkQuotaAvailability(
  segment: string,    // 'Nivel 1' | 'Nivel 2' | 'Nivel 3' | 'Nivel 4'
  nseRegion: string,  // 'Guatemala - Centro I' etc.
  country: string,
): Promise<boolean> {
  const [quota] = await db
    .select()
    .from(quotaTargets)
    .where(
      and(
        eq(quotaTargets.country, country),
        eq(quotaTargets.region, nseRegion),
        eq(quotaTargets.nseLevel, segment),
        eq(quotaTargets.active, true),
      )
    )

  if (!quota || quota.targetCount === 0) return false

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(leads)
    .where(
      and(
        eq(leads.quotaSegment, segment),
        // join con survey_profiles para filtrar por nseRegion
        inArray(leads.leadStatus, QUALIFIED_STATUSES),
      )
    )

  return count < quota.targetCount
}
```

---

## 10. Plan: Dashboard de Leads

### Objetivo

Una página de monitoreo en tiempo real del progreso de leads por país, NSE y región, equivalente al archivo Excel pero dinámica y con datos reales de la DB.

### Ruta sugerida

```
/admin/dashboard    → Vista principal del dashboard
```

### Componentes del dashboard

#### 10.1 Resumen global (cards superiores)

```
┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│  Total      │  │ Conseguidos │  │ Disponibles │  │  % Avance   │
│  Objetivo   │  │             │  │             │  │             │
│   3,494     │  │    159      │  │   3,335     │  │   4.6%      │
└─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘
```

#### 10.2 Tabla de progreso por región y NSE

Réplica dinámica del Excel, con datos en tiempo real desde la DB:

```
REGIÓN                    | Nivel 1        | Nivel 2        | Nivel 3        | Nivel 4
                          | Obj/Con/Disp   | Obj/Con/Disp   | Obj/Con/Disp   | Obj/Con/Disp
Costa Rica - AM II        |  0 /  0 /  0   | 46 /  1 / 45   | 42 /  1 / 41   | 78 /  2 / 76
...
```

Con barras de progreso visuales por celda y color-coding (rojo < 25%, amarillo 25–75%, verde > 75%).

#### 10.3 Gráfico de barras por país

Progreso total de leads conseguidos vs. objetivo por país (CAM, MX, EC).

#### 10.4 Embudo de conversión

```
Total iniciaron conversación
        ↓ [%]
Pasaron D1 (T&C)
        ↓ [%]
Pasaron D3 (es comprador)
        ↓ [%]
Completaron encuesta
        ↓ [%]
Calificaron por NSE + cuota
        ↓ [%]
Registrados en app
        ↓ [%]
Ficha Hogar completada  ✅
```

#### 10.5 Filtros

- Por país (CAM / México / Ecuador)
- Por NSE (Nivel 1/2/3/4)
- Por región
- Por canal (Telegram / WhatsApp)
- Por rango de fechas

### Implementación técnica

**API routes:**
```
GET /api/admin/dashboard/summary     → cards globales
GET /api/admin/dashboard/by-region   → tabla región × NSE
GET /api/admin/dashboard/funnel      → métricas de conversión
GET /api/admin/dashboard/by-country  → resumen por país
```

**Actualización:** Polling cada 60 segundos o con botón de refresh manual. No se necesita WebSocket para esta fase.

**Stack UI:** React Server Components + `recharts` para gráficos (ya es posible con Next.js App Router).

---

## 11. Estado de implementación por feature

### ✅ Implementado y funcionando

- Flujo completo de 4 fases (Telegram y WhatsApp)
- Opt-in inicial + Decision points D1, D2, D3 (spec `007-fase1-new-survey-questions`)
- Encuesta de 19 preguntas (16 originales + edad/embarazo/bebé<3, spec `007-fase1-new-survey-questions`)
- GPS gate + reverse geocoding + catálogo NSE-GEO CAM
- Validación geográfica de Guatemala (departamento → municipio → zona)
- Corrección de respuestas previas durante la encuesta
- FAQ RAG (preguntas frecuentes via embeddings pgvector)
- Re-engagement automático via QStash (fases 1 y 2)
- Dual provider WhatsApp (Meta Cloud API + Twilio)
- UI de conversaciones (`/admin/conversations`, dentro del área admin — spec `009-admin-login-sidebar`)
- Eval QA automatizado (conversation evals)
- Persistencia de panelista en sistema Treinta
- AI summary del perfil del panelista
- **Scoring SCL**: fórmula oficial Kantar SCL-CAM (NiPSH/HACI/AUTO/SD), segmentos `Nivel 1-4`, 12 opciones de educación PSH, género `Masculino/Femenino` (spec `004-scl-cam-scoring-fix`)
- **Cuota real**: `checkQuotaAvailability` consulta la tabla `quota_targets` (objetivo vs. conseguidos reales) en vez de un mock aleatorio; incluye panel administrativo (`/admin/quotas`) para ver/editar/activar-desactivar cuotas e importar/exportar desde Excel (spec `005-quota-admin-panel`)
- **Dashboard de leads** (`/admin/dashboard`): cards de resumen, tabla región×NSE con color-coding, gráfico por país, embudo de conversión de 7 etapas, filtros (país/región/NSE/canal/fecha), polling de 60s (spec `006-leads-dashboard`)
- **Preguntas nuevas de Fase 1**: opt-in inicial (nuevo decision point antes de D1), edad, embarazo, bebé < 3 años — cuotas extra sin impacto en el score NSE (spec `007-fase1-new-survey-questions`)
- **Fase 4 interactiva (Ficha Hogar)**: cuestionario de 7 preguntas con motor de estado propio (`ficha_hogar_profiles`), gate de descarte por conflicto de interés (P1), corrección de respuestas, y merge de datos en el resumen AI/Treinta (spec `008-ficha-hogar-interactive`)
- **Login + sidebar de admin**: `/` es ahora el formulario de login (reemplaza el Basic Auth); sesión vía cookie firmada (HMAC, sin tabla en DB); todas las páginas internas (`/admin/quotas`, `/admin/dashboard`, `/admin/conversations`) viven detrás del mismo gate y comparten un sidebar colapsable (shadcn/ui) para navegar entre secciones; `/api/conversations/*` y `/api/evals/*` también quedaron protegidos (antes eran públicos); URLs viejas (`/conversations`) redirigen a su nueva ubicación (spec `009-admin-login-sidebar`)
- **Cuotas flexibles por dimensión**: matching OR entre NSE/edad/integrantes (calificar por cualquier dimensión con cupo, no las tres a la vez), todas las regiones abiertas, tope agregado manual por región (`quota_region_caps`), excepción sin límite para embarazo/bebé — ver [§8.1](#81-cuotas-flexibles-por-dimensión-2026-07-20) (spec `011-flexible-quota-matching`)
- **Chat web**: nuevo canal `web` — página pública `/chat` para conversar con el bot sin Telegram/WhatsApp, misma máquina de estados y reglas de negocio que los otros canales, sesión anónima persistente por navegador — ver [§12](#12-chat-web-canal-nuevo) (spec `012-web-chat-channel`)

### ⚠️ Implementado pero incompleto / con bugs

*(ninguno conocido actualmente — ver Pendiente de implementar para trabajo futuro)*

### ❌ Pendiente de implementar

- Soporte para México y Ecuador (Excel TBD)

---

## 12. Chat web (canal nuevo)

> ✅ **Implementado** en `specs/012-web-chat-channel`. Nuevo canal `web` — antes solo existía como valor del enum sin ninguna implementación (cada `case 'web'` en `send.ts` lanzaba error).

### Qué es

Una página pública (`/chat`, fuera de `/admin`, sin autenticación) donde cualquier visitante puede conversar directamente con el mismo bot de reclutamiento que hoy corre en Telegram y WhatsApp — mismo opt-in, misma encuesta de calificación, mismo scoring NSE, mismas cuotas flexibles por dimensión (§8.1), mismo resultado final. No es un asistente ni un flujo distinto: es el motor de conversación existente (`routeMessage`/`handlePhase1`, sin cambios) con una tercera puerta de entrada/salida.

### Identidad del visitante

Sin cuenta ni login. Una cookie `web_session_id` (UUID v4, `HttpOnly`, ~2 años de vigencia) identifica al visitante en su navegador; ese UUID se usa tal cual como `channelUserId` del lead (`upsertLead('web', sessionId)`) — mismo campo e índice único que ya usan Telegram (`chat_id`) y WhatsApp (teléfono), sin cambios de schema.

### Cómo llega la respuesta del bot (sin webhook externo)

A diferencia de Telegram/WhatsApp (el bot responde llamando a la API del proveedor, de forma asíncrona tras devolver `200` al webhook), el canal web no tiene un proveedor externo al que "empujarle" el mensaje. En su lugar:

- `POST /api/chat/web` procesa el turno de forma **síncrona** (`await routeMessage(...)`, sin el `after()` que usan los webhooks) y devuelve la respuesta del bot en el mismo HTTP response.
- Los mensajes salientes se "entregan" simplemente persistiéndolos en `conversation_messages` (la misma tabla que ya registra todos los mensajes de todos los canales para el panel admin) — los `case 'web'` de `src/lib/messaging/send.ts` ya no lanzan error, solo dejan de llamar a un SDK externo.
- `GET /api/chat/web` es el "bootstrap": resuelve/crea la sesión, dispara el mensaje de apertura si el lead nunca tuvo mensajes, y devuelve el historial completo — así una recarga de página retoma exactamente donde quedó (sin repetir el opt-in).

No hay WebSocket ni SSE — el modelo es puramente request/response, suficiente para todos los escenarios del spec (incluida la ubicación GPS vía el permiso de geolocalización del navegador, que se mapea 1:1 al mismo `ChannelInbound.location` que ya usa el GPS de Telegram/WhatsApp).

### Límite conocido: re-enganche

Los jobs de re-enganche (QStash) para un lead del canal web simplemente registran su mensaje en `conversation_messages` — no hay forma de "empujarlo" a una pestaña de navegador que pudo haberse cerrado. El visitante lo verá la próxima vez que abra o recargue `/chat`. Limitación conocida y aceptada, no un bug.

### Panel administrativo

Sin cambios — `/admin/conversations` y `/admin/dashboard` ya renderizaban `channel` de forma genérica (incluido un filtro "Web" ya presente en el dashboard desde antes de esta feature); los leads y conversaciones del canal web aparecen ahí automáticamente.

---

## 13. Integración Panel Smart & Kantar (2026-07-29)

> ✅ **Implementado** en commits 5341c4f, ca53435. Nueva integración para sincronizar leads con el sistema Panel Smart de Kantar.

### Qué es Panel Smart

Panel Smart es una plataforma partner de Kantar que centraliza y gestiona los datos de panelistas reclutados. El bot de PanelSmart Recruitment Bot ahora sincroniza automáticamente los leads que completan el flujo de calificación y registro con el sistema Panel Smart, permitiendo que Kantar vea las respuestas de investigación en tiempo real.

### Arquitectura de sincronización

```
Lead completa Fase 4 (Ficha Hogar)
        ↓
  ficha_hogar_completada (DB)
        ↓
  QStash recurring job (cada 3h)
        ↓
  Panel Smart Abandoned-Sync handler
        ↓
  Panel Smart Client (API HTTP)
        ↓
  Panel Smart / Kantar infraestructura
```

**Flujo de datos:**

1. **Capture**: Lead completa el flujo de 4 fases y llega a estado `ficha_hogar_completada`
2. **Batching**: Cada 3 horas, un job QStash ejecuta `POST /api/jobs/panel-smart-abandoned-sync`
3. **Question Mapping**: Las respuestas del lead (survey + ficha hogar) se mapean al formato de preguntas de Panel Smart
4. **Push**: Se llama a la API de Panel Smart con las respuestas en formato esperado
5. **Tracking**: Se registra en tabla `panel_smart_syncs` el timestamp y estado de cada sincronización

### Tecnología & Implementación

**Nuevo módulo**: `src/lib/panel-smart/`

| Archivo | Propósito |
|---------|-----------|
| `client.ts` | Cliente HTTP que habla con API Panel Smart (autenticación, endpoints, headers) |
| `sync.ts` | Lógica de sincronización: query de leads pendientes, mapeo de respuestas, reintentos |
| `question-map.ts` | Mapeo bidireccional: preguntas del bot → campos de Panel Smart |
| `types.ts` | TypeScript types para payloads de Panel Smart |

**Job handler**: `app/api/jobs/panel-smart-abandoned-sync/route.ts`

- Endpoint protegido (requiere `Authorization: Bearer QSTASH_CURRENT_SIGNING_KEY`)
- Función de manejo: `handlePanelSmartAbandonedSync()`
- Lógica:
  1. Query `leads` con estado `ficha_hogar_completada` y última sincronización > 3h atrás
  2. Para cada lead, construir payload de preguntas usando `question-map.ts`
  3. Llamar a Panel Smart Client
  4. Registrar resultado en `panel_smart_syncs` (timestamp, lead_id, status, error si aplica)
  5. No modifica el estado del lead (permanece en `ficha_hogar_completada`)

### QStash Recurring Schedule

Sustituye a Vercel Cron (que se limita a 1 ejecución/día en Hobby tier). Ahora usa **QStash recurring schedules** para ejecutar cada 3 horas:

**Configuración manual** (ver `QSTASH_SETUP.md`):

```bash
curl -X POST https://qstash.io/v2/schedules/ \
  -H "Authorization: Bearer $QSTASH_API_KEY" \
  -d '{
    "destination": "https://chat-ai-panel.vercel.app/api/jobs/panel-smart-abandoned-sync",
    "cron": "0 */3 * * *"
  }'
```

Esto crea un schedule que:
- Ejecuta a las 0:00, 3:00, 6:00, 9:00, 12:00, 15:00, 18:00, 21:00 UTC diariamente
- Incluye header `Authorization: Bearer [key]` automáticamente
- Reintentos automáticos si el endpoint falla

### Variables de entorno nuevas

```
# Panel Smart API
PANEL_SMART_API_URL=https://[panel-smart-endpoint]
PANEL_SMART_API_KEY=[api-key-provided-by-kantar]

# QStash
QSTASH_CURRENT_SIGNING_KEY=[key-para-verificar-webhooks]
QSTASH_API_KEY=[key-para-crear-schedules]
```

### Vinculación con Constitution

Esta integración cumple con **Principle II: Observability First** (`.specify/memory/constitution.md`):

- ✅ Todos los calls a Panel Smart se registran con timestamp, lead_id, status
- ✅ Errores se capturan en tabla `panel_smart_syncs` para auditoría
- ✅ Logs incluyen request/response para debugging
- ✅ Health checks pueden consultar `panel_smart_syncs` para detectar roturas en la integración

---

## 14. Configuración de WhatsApp (Canal)

### Proveedores soportados

El bot soporta dos proveedores de WhatsApp:

| Proveedor | Tipo | Usado cuando |
|-----------|------|-------------|
| **Meta** (default) | WhatsApp Business Cloud API | `WHATSAPP_PROVIDER=meta` o no especificado |
| **Twilio** | Twilio WhatsApp Sandbox / Production | `WHATSAPP_PROVIDER=twilio` |

### Configuración: Meta WhatsApp Cloud API

#### 1. En Meta Developer Portal

1. Ve a [developers.facebook.com](https://developers.facebook.com)
2. Crea una App (si no la tienes) o usa una existente
3. Agrega **WhatsApp** como producto:
   - En tu App → **Dashboard**
   - Click en **Agregar producto** → busca **WhatsApp**
   - Click en **Set Up**

#### 2. Obtener Credenciales

**En WhatsApp → API Setup:**
- Copia el **Access Token** → usar en `WHATSAPP_ACCESS_TOKEN`
- Copia el **Phone Number ID** → usar en `WHATSAPP_PHONE_NUMBER_ID`
- Guarda el **Phone Number ID** (formato: números sin `+`, ej: `5216171234567`)

**En Settings → Basic:**
- Copia el **App Secret** → usar en `WHATSAPP_APP_SECRET`

**Para Verify Token:**
- Elige un string seguro (ej: `abc123xyz-secure-token`)
- Úsalo en `WHATSAPP_VERIFY_TOKEN`
- Este mismo valor va en la configuración del webhook en Meta

#### 3. Configurar Webhook en Meta

**En WhatsApp → Configuration:**

1. **Callback URL**: `https://chat-ai-panel.vercel.app/api/webhooks/whatsapp`
2. **Verify Token**: El string que elegiste en paso 2
3. Click en **Verify and Save**

#### 4. Suscribirse a Eventos

**En Webhooks → Subscribe to webhook events** (marcar):
- ✅ `messages` — recibir mensajes del usuario
- ✅ `message_template_status_update` — estado de plantillas (opcional pero recomendado)
- ✅ `message_status` — confirmación de entrega (opcional)

#### 5. Vinculación de Número

**En Getting Started:**
- Vincula tu número de teléfono (recibe SMS de verificación)
- Obtén el **Phone Number ID** (si no lo hiciste en paso 2)

### Configuración en Vercel

1. Ve a **Vercel Dashboard** → Tu proyecto `chat-ai-panel` → **Settings** → **Environment Variables**

2. Agrega estas variables:

```
WHATSAPP_PROVIDER=meta
WHATSAPP_ACCESS_TOKEN=<valor-de-meta>
WHATSAPP_PHONE_NUMBER_ID=<tu-phone-number-id>
WHATSAPP_VERIFY_TOKEN=<tu-string-seguro>
WHATSAPP_APP_SECRET=<app-secret-de-meta>
WHATSAPP_GRAPH_VERSION=v21.0
```

3. Haz `git push` para que Vercel redepliegue con las nuevas variables

### Flujo de mensajes (Meta)

```
Usuario (WhatsApp)
        ↓
  Webhook: GET /api/webhooks/whatsapp (hub verification)
        ↓
  Webhook: POST /api/webhooks/whatsapp (inbound message)
        ↓
  verifyMetaSignature() — validar X-Hub-Signature-256
        ↓
  normalizeMetaInbound() — parsear payload Meta
        ↓
  processWhatsAppInbound() — lógica de bot (igual que Telegram)
        ↓
  sendMessage() → Meta Graph API (/messages)
        ↓
  Usuario recibe respuesta
```

### Testeo Local

Para testear webhooks en local sin exponer tu máquina:
- Usa **[ngrok](https://ngrok.com)** para tunneling HTTP
- O espera a que esté deployado en Vercel y usa el webhook URL directo

Ejemplo con ngrok:
```bash
ngrok http 3000
# Obtienes: https://xxx-xxx-ngrok.io
# Usa en Meta: https://xxx-xxx-ngrok.io/api/webhooks/whatsapp
```

### Variables de entorno (referencia completa)

```bash
# Provider: meta (default) o twilio
WHATSAPP_PROVIDER=meta

# Meta WhatsApp Cloud API
WHATSAPP_ACCESS_TOKEN=EAAxx...
WHATSAPP_PHONE_NUMBER_ID=123456789
WHATSAPP_VERIFY_TOKEN=secure-token-here
WHATSAPP_APP_SECRET=abc123...
WHATSAPP_GRAPH_VERSION=v21.0  # Opcional, default v21.0

# Twilio (alternativa, si WHATSAPP_PROVIDER=twilio)
TWILIO_ACCOUNT_SID=ACxxxxxxxx
TWILIO_AUTH_TOKEN=auth-token-here
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886
```

### Troubleshooting

| Problema | Causa | Solución |
|----------|-------|----------|
| Webhook no verifica | Verify Token incorrecto | Asegúrate que sea el mismo en Meta y en `WHATSAPP_VERIFY_TOKEN` |
| Mensajes no se reciben | Webhook URL incorrecta o evento no suscrito | Verifica `https://chat-ai-panel.vercel.app/api/webhooks/whatsapp` y suscriptores |
| Errores 403 al enviar | Access Token vencido o sin permisos | Regenera en Meta → WhatsApp → API Setup |
| Firma inválida | `WHATSAPP_APP_SECRET` incorrecto | Cópialo nuevamente de Settings → Basic |

---

*Documento generado automáticamente analizando el código fuente, `SCL-CAM.pdf` y `Kantar Quotas Test.xlsx`.*
