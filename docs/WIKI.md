# Wiki: PanelSmart Recruitment Bot

> Última actualización: 2026-07-17

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
9. [Plan: Panel Administrativo de Cuotas](#9-plan-panel-administrativo-de-cuotas)
10. [Plan: Dashboard de Leads](#10-plan-dashboard-de-leads)
11. [Estado de implementación por feature](#11-estado-de-implementación-por-feature)

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

Preguntas adicionales del perfil del panelista (parentesco, internet, fecha nacimiento, condición salud, plan datos, mascotas). Genera resumen AI y persiste el panelista en el sistema Treinta. Transición final → `ficha_hogar_completada`.

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

**Preguntas NUEVAS no implementadas:** #1 (bienvenida/opt-in), #12 (edad), #17 (embarazo), #18 (bebé < 3 años).

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

La Fase 4 actual en el código **no implementa estas preguntas** como un cuestionario interactivo — solo genera el resumen AI y persiste el panelista. Las preguntas de Ficha Hogar son **pendientes de implementar**.

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

### 7.1 Fórmula de scoring (`src/lib/scoring/socioeconomic.ts`)

La implementación actual **NO sigue la fórmula oficial de Kantar**. Usa una escala arbitraria de 0–100 con pesos inventados. Los problemas específicos son:

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

### 7.2 Cuota mock vs. cuota real

`src/lib/scoring/quota.ts` es un **stub**: retorna 50/50 aleatorio (determinista por lead ID). No hay conexión a cuotas reales ni a la tabla de objetivos de Kantar.

### 7.3 Nombres de segmentos

El código usa `A/B, C+, C, D+, D/E` (segmentos de México) en vez de `Nivel 1, 2, 3, 4` (segmentos de CAM).

### 7.4 Preguntas faltantes en el flujo

Las siguientes preguntas del Excel actualizado **no están implementadas**:

- **P1 (Fase 1):** Opt-in inicial "¿Te gustaría inscribirte en PanelSmart?"
- **P12 (Fase 1):** Edad del encuestado (cuota extra)
- **P17 (Fase 1):** ¿Embarazada? (cuota extra)
- **P18 (Fase 1):** ¿Bebé < 3 años? (cuota extra)
- **Fase 4 completa:** 7 preguntas de Ficha Hogar (actualmente no son interactivas en el bot)

### 7.5 Opción de género

El Excel actualizado usa **Masculino/Femenino**; el código usa **Hombre/Mujer**.

---

## 8. Sistema de cuotas actual (Kantar Quotas Test)

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

## 9. Plan: Panel Administrativo de Cuotas

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
- Decision points D1, D2, D3
- Encuesta de 16 preguntas (survey questions actuales)
- GPS gate + reverse geocoding + catálogo NSE-GEO CAM
- Validación geográfica de Guatemala (departamento → municipio → zona)
- Corrección de respuestas previas durante la encuesta
- FAQ RAG (preguntas frecuentes via embeddings pgvector)
- Re-engagement automático via QStash (fases 1 y 2)
- Dual provider WhatsApp (Meta Cloud API + Twilio)
- UI de conversaciones (`/conversations`)
- Eval QA automatizado (conversation evals)
- Persistencia de panelista en sistema Treinta
- AI summary del perfil del panelista

### ⚠️ Implementado pero incompleto / con bugs

- **Scoring SCL**: existe pero usa fórmula incorrecta (no sigue la spec Kantar)
- **Segmentos NSE**: usa nombres de México (A/B, C+…) en vez de CAM (Nivel 1/2/3/4)
- **Cuota check**: mock aleatorio, no consulta cuotas reales
- **Educación PSH**: solo 10 opciones, faltan "No alfabetizado" y "Pos Grado Incompleto"
- **Género**: opciones "Hombre/Mujer" en vez de "Masculino/Femenino"

### ❌ Pendiente de implementar

- Pregunta de opt-in inicial (P1 del Excel actualizado)
- Pregunta de edad (P12)
- Pregunta de embarazo (P17)
- Pregunta de bebé < 3 años (P18)
- Fase 4 interactiva (7 preguntas de Ficha Hogar)
- Pregunta descarte de panelista (fase 4, P1)
- Panel administrativo de cuotas
- Dashboard de leads (con datos reales)
- Soporte para México y Ecuador (Excel TBD)
- Tabla `quota_targets` en DB
- Integración de cuota real en el bot

---

*Documento generado automáticamente analizando el código fuente, `SCL-CAM.pdf` y `Kantar Quotas Test.xlsx`.*
