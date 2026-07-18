# Propuesta de Desarrollo — Chatbot de Reclutamiento PanelSmart

**Preparado por**: Christiam Omaña — Desarrollador Freelance  
**Preparado para**: True Digital Media (TDM)  
**Fecha**: julio 2026  
**Versión**: 1.0

---

## 1. Resumen Ejecutivo

Este documento describe el alcance, la arquitectura técnica, el cronograma y las condiciones económicas para el desarrollo del **Chatbot de Reclutamiento PanelSmart**, un asistente conversacional automatizado que gestiona el funnel completo de captación de panelistas para el mercado de Centroamérica y República Dominicana (CAM).

El sistema opera como canal primario sobre **WhatsApp** (vía Twilio) con soporte secundario en **Telegram** y una interfaz web para pruebas. Incorpora IA para extracción de datos demográficos, búsqueda semántica de FAQs, y reconocimiento geográfico, todo sobre una arquitectura serverless en Vercel desplegada con TypeScript / Next.js.

El proyecto se organiza en **tres módulos independientes y contratables por separado**, con estimaciones de tiempo y costo cerradas para los módulos 1 y 2 y orientativa para el módulo 3.

---

## 2. Contexto y Objetivo

TDM necesita automatizar el proceso de reclutamiento de panelistas para PanelSmart en la región CAM. El proceso actual requiere intervención humana en múltiples etapas que el chatbot reemplazará de forma integral:

- Presentar términos y condiciones y filtrar desinteresados.
- Recopilar 16 campos de perfil demográfico y del hogar.
- Calcular el nivel socioeconómico (NSE) y verificar disponibilidad de cuota geográfica.
- Guiar al panelista calificado hacia la descarga e instalación de la app PanelSmart.
- Monitorear el registro y hacer handoff a agente humano solo cuando hay fallo técnico.
- Reactivar automáticamente leads inactivos con hasta 3 notificaciones programadas.

---

## 3. Alcance del Proyecto

El proyecto se divide en tres módulos. Los módulos 1 y 2 tienen precio cerrado; el módulo 3 tiene precio orientativo sujeto a confirmación de acceso a cuenta Twilio WhatsApp Business.

---

### Módulo 1 — Bot de Reclutamiento Core

Implementa el flujo conversacional completo en WhatsApp (canal principal), con Telegram y un chat web como canales alternativos configurables, la máquina de estados del lead, el motor de re-engagement y la búsqueda semántica de FAQs.

La integración con WhatsApp es una **dependencia de TDM** y puede resolverse por dos vías (a definir antes del inicio del desarrollo):

- **Opción A — Token propio de TDM (vía Meta)**: TDM provee el token de acceso de la cuenta WhatsApp Business ya existente o gestionada directamente a través de Meta Business. El desarrollo se integra contra esa cuenta sin necesidad de crear una nueva.
- **Opción B — Cuenta Twilio (incluida en Módulo 3)**: se crea y configura una cuenta Twilio, se habilita un número de WhatsApp en modo productivo, y se gestiona el flujo de aprobación de templates con Meta. Esta opción tiene costos adicionales de plataforma Twilio y requiere el tiempo de aprobación de Meta (1–5 días hábiles).

Ver sección **Dependencias de TDM** al final de este documento.

**Fase 1 — Calificación e Ingesta (P1)**

El bot aplica tres filtros secuenciales antes de iniciar la encuesta:

- **D1 — Aceptación de T&C**: el panelista acepta los términos. Rechazo → cierre con mensaje EXIT_A.
- **D2 — Motivación por premios**: el panelista confirma interés en ganar premios. Rechazo → EXIT_A.
- **D3 — Responsable de compras del hogar**: el panelista confirma que gestiona las compras. "No" → EXIT_B (cupo lleno).

Si D3 es superado, el bot recoge una **encuesta lineal de 16 preguntas** (sin ramificaciones internas) sobre datos personales, ubicación y segmentación del hogar. Al finalizar, el sistema calcula el puntaje NSE y verifica la disponibilidad de cuota en tiempo real contra el catálogo de regiones habilitadas proporcionado por TDM (dependencia requerida antes del inicio del desarrollo). Sin cuota disponible → EXIT_B. Con cuota → avance a Fase 2.

**Fase 2 — Descarga y Entrega de Código (P2)**

Una vez calificado el lead, el bot **registra los datos del lead en la base MySQL del cliente**. Un proceso interno del cliente crea el panelista y escribe el **ID / código de registro** en esa misma MySQL. En paralelo, el bot envía el enlace a una **landing page de descarga** (Android / iOS) con tracking de clics. Cuando el usuario **confirma que descargó la app**, el bot **consulta el código en MySQL** y se lo envía por el canal conversacional, e inicia la secuencia de onboarding en video.

**Fase 3 — Monitoreo de Registro (P3)**

El sistema monitorea el resultado del registro y enruta al lead a uno de tres caminos:
- Registro exitoso → avance automático a Fase 4.
- Fallo técnico → handoff a agente humano.
- Sin respuesta en 20 horas → congelación del flujo.

**Fase 4 — Confirmación de Perfil (P4)**

Tras el registro exitoso, el sistema genera un resumen IA de las respuestas de Fase 1 para la plataforma PanelSmart y envía un video de agradecimiento al panelista. El lead queda marcado como `ficha_hogar_completada`.

**Re-engagement Automático (P5)**

En cualquier fase, si un usuario queda inactivo, el sistema programa hasta 3 notificaciones de reactivación con la siguiente cadencia desde la última actividad: 75 minutos, 7 horas, 20 horas. Tras 3 intentos sin respuesta el lead se marca como `abandono`. Si el usuario responde durante la cadencia, todos los timers pendientes se cancelan y el flujo se reanuda desde donde se pausó.

**Manejo de Mensajes Fuera de Flujo (P6)**

Cuando un usuario envía un mensaje libre que no corresponde a la pregunta actual, el sistema consulta el banco de FAQs (75 entradas precargadas) vía búsqueda semántica. Si hay coincidencia, entrega la respuesta y repite la pregunta pendiente. Si no hay coincidencia, repite la pregunta directamente. En estado terminal o sin flujo activo, redirige al canal de soporte.

**Estados del lead (8 estados)**:
`not_qualified` · `quota_exhausted` · `link_sent` · `waiting_for_code` · `code_delivered_registered` · `code_delivered_not_registered` · `code_delivered_no_response` · `ficha_hogar_completada` · `abandono`

---

### Módulo 2 — Geolocalización NSE y Cuotas CAM

Implementa la captura de ubicación vía GPS, validación contra el catálogo NSE CAM, y trazabilidad de la fuente geográfica. Opera sobre los mismos 7 países del flujo base: Guatemala, Honduras, El Salvador, Nicaragua, Costa Rica, República Dominicana y Panamá.

**GPS-first**: antes de pedir país/departamento/municipio manualmente, el bot solicita compartir la ubicación GPS del dispositivo. Si el GPS resuelve al menos país, departamento y municipio, el sistema presenta una confirmación con los valores derivados (mostrando barrio como "No identificado" si no se puede resolver). Solo tras confirmación del panelista se aplica la validación de cuota.

**Validación de catálogo NSE**: el municipio confirmado (vía GPS o manual) se valida contra el catálogo derivado de `Muestra Regiones NSE CAM.xlsx`. Dentro del catálogo → se almacena la región NSE y el flujo continúa. Fuera del catálogo → EXIT_B (`quota_exhausted`), sin continuar la encuesta.

**Fallback manual**: si el panelista cancela el GPS, falla la identificación, o rechaza la confirmación, el bot recoge los campos geográficos manualmente (botones de país + texto libre para departamento/municipio/barrio, con fuzzy matching existente). La misma validación del catálogo NSE aplica al final del path manual.

**Trazabilidad**: cada lead registra `geo_source` (GPS · texto exacto · texto fuzzy), `nse_region`, y `in_quota_geo` (boolean), expuestos en el monitor de conversaciones y la API de leads.

---

### Módulo 3 — Integración WhatsApp vía Twilio

Habilita WhatsApp como canal primario usando Twilio WhatsApp Business API. La arquitectura del bot es channel-agnostic: toda la lógica de negocio (máquina de estados, encuesta, NSE, re-engagement) reside en `src/lib/` y no cambia; solo se agrega el adaptador de canal.

**Incluye**: webhook de entrada Twilio, envío de mensajes de texto y botones interactivos (si la cuenta lo permite), gestión de templates aprobados por Meta para mensajes de re-engagement (business-initiated), y configuración del número WhatsApp Business.

**Dependencia**: requiere acceso a cuenta Twilio con número WhatsApp Business habilitado y templates Meta aprobados antes de iniciar desarrollo. El tiempo de aprobación de templates es externo y no está bajo control del desarrollador.

---

### Qué no incluye este proyecto

- Modificaciones al app PanelSmart o al proceso interno del cliente que crea panelistas/códigos en MySQL (sistemas gestionados por el cliente final). El bot solo escribe leads y lee el código resultante.
- Desarrollo de la lógica de negocio del scoring NSE (el algoritmo y sus umbrales son proporcionados por TDM como input al desarrollo).
- El catálogo geográfico actualizado NSE CAM (derivado del Excel proporcionado; actualizaciones futuras requieren nueva versión del catálogo).
- Agente humano en tiempo real (el handoff se realiza enviando el contacto de soporte configurado; el bot no construye live agent tooling).
- Cualquier funcionalidad no descrita en este documento. Los cambios sobrevenidos se valoran por separado.

---

## 4. Arquitectura Técnica

### Stack

| Capa | Tecnología | Rol |
|------|-----------|-----|
| Framework | Next.js 15 (App Router) + TypeScript | Servidor web y lógica de bot |
| Runtime | Vercel Serverless (Node.js 20 LTS) | Despliegue y escalabilidad |
| Base de datos | Neon Postgres + pgvector | Estado de leads, embeddings FAQ |
| MySQL cliente | mysql2 (conexión a DB del cliente) | Upsert de leads calificados + lectura del código de panelista |
| ORM | Drizzle ORM | Esquema y migraciones (Postgres del bot) |
| Scheduling | QStash (Upstash) | Re-engagement a 75min / 7h / 20h |
| Canal WhatsApp | Meta WhatsApp Cloud API (primario); Twilio como alternativa | Mensajería WhatsApp |
| Canal Telegram | Telegram Bot API (directo HTTP) | Canal V1 y alternativo |
| IA / LLM | Vercel AI SDK + Claude Sonnet | Extracción de campos, resumen Fase 4 |
| Embeddings | Vercel AI SDK (OpenAI text-embedding) | FAQ semántico (pgvector HNSW) |
| Validación | Zod | Schemas de salida LLM y contratos API |
| Testing | Vitest (unit) + Playwright (E2E) | Cobertura de flujos y transiciones |

### Tablas de base de datos

`leads` · `survey_profiles` · `flow_states` · `re_engagement_schedules` · `faq_entries` · `llm_call_logs`

### Rendimiento objetivo

- Webhook `200 OK` retornado en < 1 segundo.
- Extracción LLM (campos demográficos) en < 4 segundos.
- Búsqueda semántica FAQ en < 100 ms.
- Escritura de transición de estado en < 200 ms.

### Seguridad y privacidad

- Validación de webhook secret token antes del parsing en toda llamada entrante.
- Rate limiting en el handler de webhook antes de cualquier procesamiento.
- PII (campos demográficos) nunca se loguea en texto plano; solo se registran nombres de campo y conformidad con el schema.
- `generateObject` + Zod limita la salida del LLM: ningún texto libre del modelo llega a la base de datos ni al scoring.
- Latitudes/longitudes brutas del GPS no se persisten; solo los nombres administrativos confirmados.

---

## 5. Fases del Proyecto y Cronograma

Las fases son secuenciales dentro de cada módulo; los módulos 2 y 3 pueden iniciarse en paralelo una vez establecida la base del módulo 1.

### Módulo 1 — Bot Core

| Fase | Descripción | Días hábiles |
|------|-------------|:---:|
| M1.1 | Arquitectura, esquema DB, migraciones, setup Vercel | 3 |
| M1.2 | Flujo Fase 1: D1/D2/D3 + encuesta 16 preguntas + máquina de estados | 5 |
| M1.3 | Flujo Fases 2 y 3: onboarding, registro, handoff | 4 |
| M1.4 | Landing page de descarga: botones iOS/Android + tracking de clics por plataforma | 2 |
| M1.5 | Flujo Fase 4: resumen IA + video agradecimiento | 2 |
| M1.6 | Re-engagement (QStash): cadencia 75min/7h/20h + cancelación | 2 |
| M1.7 | FAQ semántico: seed embeddings, búsqueda pgvector | 2 |
| M1.8 | Integración Telegram: inbound/outbound, validación de secret | 2 |
| M1.9 | Testing: unit (Vitest) + E2E (Playwright) + correcciones | 5 |
| **Subtotal M1** | | **27 días** |

### Módulo 2 — NSE Geo

| Fase | Descripción | Días hábiles |
|------|-------------|:---:|
| M2.1 | Importación y versionado del catálogo NSE CAM (Excel) | 1 |
| M2.2 | Integración de reverse geocoding (proveedor a definir) | 2 |
| M2.3 | Flujo GPS-first: solicitud → identificación → confirmación | 2 |
| M2.4 | Validación de catálogo + allowlist + EXIT_B condicional | 2 |
| M2.5 | Fallback a geo manual con mismo allowlist | 1 |
| M2.6 | Trazabilidad: geo_source, nse_region, in_quota_geo en API | 1 |
| M2.7 | Testing: paths GPS-in, GPS-out, manual-in, manual-out | 2 |
| **Subtotal M2** | | **11 días** |

### Módulo 3 — WhatsApp Twilio

| Fase | Descripción | Días hábiles |
|------|-------------|:---:|
| M3.1 | Adaptador Twilio: webhook entrada, envío mensajes y botones | 2 |
| M3.2 | Templates Meta para re-engagement (business-initiated) | 2 |
| M3.3 | Pruebas en canal WhatsApp + ajustes | 2 |
| **Subtotal M3** | | **6 días** |

### Infraestructura y Cierre

| Fase | Descripción | Días hábiles |
|------|-------------|:---:|
| D | Deployment final, variables de entorno, monitoreo | 3 |
| PM | Coordinación, documentación técnica entregable | 3 |
| **Subtotal** | | **6 días** |

**Duración total (módulos 1 + 2 + 3 + infra + PM): ~15 días hábiles** desde la aprobación formal de esta propuesta, asumiendo disponibilidad de los inputs requeridos al inicio de cada módulo.

---

## 6. Hitos y Criterios de Cierre

| Hito | Descripción | Criterio de aceptación |
|------|-------------|----------------------|
| H1 | Bot funcional en WhatsApp con flujo completo (M1) | Todos los paths del quickstart ejecutan sin errores; estados del lead correctos al 100% |
| H2 | Validación NSE + GPS activos (M2) | GPS-in, GPS-out, manual-in, manual-out producen el resultado correcto con trazabilidad visible en API |
| H3 | WhatsApp activo (M3) | Conversación de extremo a extremo en WhatsApp con re-engagement vía template aprobado |
| H4 | Puesta en producción | Deployment en Vercel con monitoreo activo; health endpoints respondiendo |

La ventana de testeo final es de **30 días calendario** desde la puesta en producción. Se incluye **1 iteración de ajuste por semana** durante ese período; los bugs nuevos detectados fuera del alcance acordado se valoran como cambio de alcance.

---

## 7. Entregables

- Repositorio privado con el código fuente completo (TypeScript, Next.js, tests).
- Migraciones de base de datos versionadas (Drizzle).
- Script de seed del catálogo FAQ y NSE CAM.
- Landing page de descarga con tracking de clics por plataforma (iOS / Android), desplegada en Vercel.
- Documentación técnica: contratos de API (webhooks Telegram/Twilio, lead state API, sync MySQL cliente + lookup de código), modelo de datos, quickstart de validación.
- Deployment funcional en Vercel con entorno de producción y staging separados.
- Variables de entorno documentadas y transferidas de forma segura.

---

## 8. Roles y Responsabilidades

| Parte | Responsabilidades |
|-------|-------------------|
| Christiam Omaña | Desarrollo completo, testing, deployment y entrega de documentación técnica. |
| TDM | Proporcionar: algoritmo NSE y umbrales; 75 entradas FAQ; catálogo NSE CAM actualizado (Excel); acceso y esquema de la MySQL del cliente (tabla/columnas para leads y código de panelista); número WhatsApp Business habilitado en Twilio; contacto de soporte real; videos de onboarding y agradecimiento. Consolidar feedback por hito dentro de la ventana de testeo. |
| Cliente final (Kantar/PanelSmart) | Mantener el catálogo NSE CAM actualizado. Operar el proceso interno que escribe el código de panelista en MySQL y entregar credenciales/esquema de esa base. |

---

## 9. Presupuesto

### 9.1 Costos de Desarrollo

El precio de M1 y M2 es cerrado. El precio de M3 es orientativo y se confirma una vez verificado el acceso a la cuenta Twilio con WhatsApp Business habilitado.

| Módulo | Descripción | Días | Importe |
|--------|-------------|:----:|--------:|
| M1 | Bot de Reclutamiento Core + Landing page de descarga | 27 | $2,000 USD |
| M2 | Geolocalización NSE + Cuotas CAM | 11 | $1,000 USD |
| **Subtotal cerrado (M1 + M2)** | | **38** | **$3,000 USD** |
| M3 | Integración WhatsApp vía Twilio | 6 | $600 USD |
| Infra & DevOps | Deployment, monitoreo, configuración | 3 | $250 USD |
| Gestión & documentación | Coordinación y entregables técnicos | 3 | $150 USD |
| **Total completo (M1 + M2 + M3)** | | **50** | **$4,000 USD** |

> Precios sin IVA.

**Modalidad de pago sugerida**: 30% al inicio (aprobación formal), 40% en entrega de H1 (bot Telegram funcional), 30% en puesta en producción.

---

### 9.2 Costos Operativos Mensuales (plataforma en producción)

Una vez el sistema esté en producción, los costos recurrentes dependen del volumen de conversaciones. A continuación se presentan los rangos para tres escenarios de uso.

| Servicio | Bajo (< 1k conv/mes) | Medio (1k–5k conv/mes) | Alto (> 5k conv/mes) |
|----------|:-------------------:|:---------------------:|:--------------------:|
| Vercel Pro | $20 | $20 | $20 |
| Neon Postgres (Pro) | $19 | $19 | $69+ |
| QStash (Upstash) | $10 | $20 | $50+ |
| Anthropic Claude API | $20–40 | $50–120 | $150–400 |
| Google Maps / Geocoding API | $5–15 | $20–60 | $80–200 |
| Twilio WhatsApp (conversaciones) | $25–50 | $60–200 | $300–800 |
| **Total estimado / mes** | **$99–154** | **$189–439** | **$669–1,539** |

> Los costos de Twilio WhatsApp varían según país de destino y tipo de mensaje (user-initiated vs business-initiated / template). Los templates de re-engagement tienen un costo mayor al ser business-initiated. Se recomienda revisar la tarifa actual de Twilio para CAM antes del lanzamiento.

> Los costos de la API de Claude varían según el volumen de extracciones de texto libre (campos demográficos) y resúmenes de Fase 4. El modelo recomendado es Claude Sonnet para extracción y Claude Haiku para FAQ si se requiere optimización de costo.

---

## 10. Supuestos y Dependencias

- **Dependencia bloqueante para M1**: TDM proporciona el algoritmo NSE (scoring fields + umbrales) y las 75 entradas FAQ antes de iniciar el desarrollo del flujo de calificación.
- **Dependencia bloqueante para M2**: TDM entrega el archivo `Muestra Regiones NSE CAM.xlsx` final y actualizado antes de iniciar M2.
- **Dependencia bloqueante para M3**: cuenta Twilio con número WhatsApp Business habilitado disponible y templates Meta aprobados antes de iniciar M3. El proceso de aprobación de Meta puede tomar 1–5 días hábiles y es externo al desarrollo.
- **MySQL del cliente**: credenciales de staging, DDL/mapa de columnas (lead → código de panelista) y proceso interno que escribe el código deben estar disponibles antes del inicio de Fases 2 y 3. No se usa CreatePanelist/GPM ni PATCH de código PanelSmart desde el bot.
- El alcance de cada módulo queda cerrado antes de iniciar su desarrollo. Cualquier caso nuevo posterior se trata como cambio de alcance.
- Las estimaciones asumen disponibilidad plena del desarrollador durante el período acordado y feedback de TDM dentro de las ventanas de testeo establecidas.

---

## 11. Gestión de Cambios de Alcance

Cualquier funcionalidad, caso o entregable no descrito expresamente en este documento se considera fuera de alcance. Los cambios se gestionan así:

1. TDM documenta el cambio con descripción y justificación.
2. El desarrollador valora el impacto en tiempo y costo.
3. El cambio solo se incorpora una vez aprobado por ambas partes.

Los cambios de alcance pueden afectar el cronograma total.

---

## 12. Dependencias de TDM

Para que el desarrollo pueda iniciar y avanzar sin bloqueos, TDM debe proveer los siguientes insumos en los plazos indicados.

| # | Insumo | Requerido antes de | Opciones / Notas |
|---|--------|-------------------|-----------------|
| 1 | **Integración WhatsApp** | Inicio M1 | **Primario**: WhatsApp Business Cloud API (Meta) — token, Phone Number ID, App Secret, verify token. **Alternativa**: Twilio WhatsApp (`WHATSAPP_PROVIDER=twilio`). Templates Meta aprobados para re-engagement fuera de ventana 24h. |
| 2 | **Algoritmo NSE y umbrales de segmentación** | Inicio M1 (Fase 1) | Fórmula de scoring sobre los campos: educación PSH, autos, servicio doméstico, tamaño del hogar, habitaciones. Con umbrales de corte por segmento. |
| 3 | **75 entradas del banco de FAQs** | Inicio M1 (M1.7) | Pares pregunta–respuesta aprobados por TDM/Kantar para carga en pgvector. |
| 4 | **Archivo NSE CAM actualizado** | Inicio M2 | `Muestra Regiones NSE CAM.xlsx` con regiones y municipios habilitados por país (Guatemala, Honduras, El Salvador, Nicaragua, Costa Rica, Rep. Dominicana, Panamá). |
| 5 | **Acceso MySQL cliente + esquema de leads/código** | Inicio M1 (M1.3) | Host/credenciales staging, tabla y columnas para upsert del lead y lectura del ID/código de panelista. El proceso interno que genera el código es responsabilidad del cliente. |
| 6 | **Contacto de soporte real** | Inicio M1 (M1.3) | Número o canal al que se redirige al panelista en caso de fallo técnico o estado terminal. |
| 7 | **Videos de onboarding y agradecimiento** | Inicio M1 (M1.5) | URLs de los videos alojados externamente que el bot envía en Fase 2 (onboarding) y Fase 4 (agradecimiento). |
| 8 | **Templates Meta aprobados** | Solo si Opción B (Twilio) | Templates de re-engagement para mensajes business-initiated. El proceso de aprobación toma 1–5 días hábiles y es gestionado por TDM ante Meta. |

> Cualquier retraso en la entrega de estos insumos puede impactar el cronograma total. Las fases dependientes de cada insumo no iniciarán hasta que el input correspondiente esté disponible y verificado.

---

## 13. Condiciones Generales

- Los precios están en USD y no incluyen impuestos aplicables.
- La planificación se activa únicamente tras la firma o confirmación escrita de esta propuesta por parte de TDM.
- Los entregables son propiedad de TDM una vez completado el pago total.
- El desarrollador retiene el derecho de uso del código como referencia técnica de su portfolio, salvo acuerdo de confidencialidad expreso.
- Esta propuesta tiene vigencia de **30 días** desde la fecha de emisión.

---

*Christiam Omaña — Desarrollador Freelance*  
*christiamchivico@gmail.com*
