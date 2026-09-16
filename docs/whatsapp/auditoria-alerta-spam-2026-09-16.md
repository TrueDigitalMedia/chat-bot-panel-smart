# Auditoría de seguimiento — Alerta "Sending spam" WABA Panelsmart Latino

**Fecha:** 2026-09-16 · **Ventana analizada:** 2026-09-08 → 2026-09-16 (8 días)
**Fuentes:** logs de Twilio (28.175 mensajes vía REST + 42 Monitor Alerts), tablas `conversation_messages`,
`leads`, `consent_events`, `messaging_suppressions`, `re_engagement_schedules` en Neon (solo lectura),
y revisión del código de opt-out / re-engagement / envío.
**Antecedente:** [auditoria-alerta-spam-2026-09-10.md](auditoria-alerta-spam-2026-09-10.md).

---

## 1. Resumen ejecutivo

Las dos correcciones P0 de la auditoría anterior **están en producción y funcionan**. Los indicadores
duros mejoraron mucho. Queda **una violación de política real, de bajo volumen pero cualitativamente
grave** (se reinicia el flujo a gente que ya se dio de baja), y el grueso del riesgo sigue siendo
**volumen desperdiciado y fricción**, no falta de consentimiento.

| Señal | 5 días previos (09-10) | 8 días actuales | Estado |
|---|---|---|---|
| Volumen total Twilio | 37.387 (≈7.500/día) | 28.175 (≈3.130/día) | ✅ −58% diario |
| Tasa de lectura | 85% | **87,2%** (12.745/14.609) | ✅ |
| Errores 11200 (webhook caído) | 19 | **0 desde el 09-09** | ✅ resuelto |
| Concentración en +1 786-933-7825 | 99,6% | 85,4% | ⚠️ mejoró, sigue alta |
| Leads que nunca respondieron | 12/1.314 | **5/868 (0,6%)** | ✅ |
| Fallos de entrega | — | 49/14.609 = **0,34%** | ✅ |
| Salientes después de un opt-out | 0 | **0** (fuga clásica) | ✅ |
| Reinicio de flujo a gente dada de baja | no medido | **5 casos / 3 leads** | 🔴 nuevo |
| Lista de supresión poblada | recién creada | 12 filas vs **80 leads con opt-out** | 🔴 backfill sin correr |

---

## 2. Lo que quedó demostrado (evidencia para la apelación)

1. **El bug de firma del webhook está cerrado.** Los 19 errores `11200` se concentran en el 08 y 09 de
   septiembre y **desaparecen por completo** a partir del deploy del fix. Ningún inbound (STOP, queja,
   respuesta) se perdió desde entonces.
2. **Cero fugas después del opt-out.** 0 mensajes salientes a leads con `status_reason` de opt-out o
   decline pasados 2 minutos de la transición. El corte del motor funciona.
3. **Los STOP se procesan.** 14 opt-outs registrados en `consent_events` en la ventana, incluidos 12
   mensajes literales "STOP"/"Stop". Los 3 `decision=true` son re-ingresos confirmados.
4. **Casi todos los errores 21610 son nuestro propio acuse de baja rebotando.** De los 22 intentos
   bloqueados por Twilio, **18 son el texto "Entendido, no hay problema 🙏 / Ya no te contactaremos"**:
   el usuario escribió STOP directo a Twilio, Twilio nos bloqueó, y lo único que rebotó fue la cortesía
   de confirmación. Es lo contrario a spam — es el sistema deteniéndose.
5. **Calidad de entrega sana:** 87,2% de lectura, 0,34% de fallos, **cero errores 63016** (mensaje libre
   fuera de la ventana de 24 h) — no estamos forzando plantillas ni saltándonos la ventana.
6. **Las 25 entregas fallidas por `63024` son números de prueba de QA** (`+593900112233`,
   `+593900557788`), no usuarios reales.
7. **30 plantillas, todas `approved`.** ⚠️ Corregido el 2026-09-16 tras revisar Meta Business Manager: **27 de las 30 son categoría `MARKETING`** (`scripts/twilio-templates.config.ts`), no de servicio/utility como afirmaba la auditoría del 09-10 y la primera versión de esta. Solo `registration_instructions_confirm` y `registration_code_delayed` son UTILITY, y `registration_code_otp` es AUTHENTICATION. Ver §6.
8. **Re-engagement muy acotado:** 1 solo intento (34 leads de 868 lo recibieron), 183 nudges
   **descartados por falta de consentimiento** (`skipped_no_consent`) y 11 por techo de salientes.

---

## 3. Hallazgos nuevos

### 🔴 P0 — Reiniciamos el flujo a usuarios que ya se dieron de baja

**Qué pasa.** En `src/lib/conversation/flow-router.ts:242` la rama de reinicio corre **antes** de la
rama `hasOptedOut` (línea 264) y está documentada como "allow restart from any state (including
terminal)". Y `isRestartRequest` (línea 47) considera reinicio un simple **"hola"**:

```ts
if (/^(hola|buenas|buen[oa]s)\b[!?.]*$/.test(t)) return true
```

Resultado: cualquier persona que hizo opt-out y después escribe "hola" —lo más natural del mundo—
dispara `resetLeadConversation` y **recibe de nuevo el saludo, los T&C y el pedido de permiso de
contacto, sin ninguna reconfirmación de consentimiento**. Eso es exactamente lo que Meta sanciona.

**Caso real (+57 301 776 9002):** hizo opt-out el 24-ago con "stop". El 14-sep escribió "Hola" a las
17:34 → `¡Listo! Empezamos de nuevo 🚀` + reinicio completo del onboarding. Volvió a escribir "Hola" a
las 17:34:59 → se reinició otra vez. Solo se frenó porque Twilio lo tenía en su propia lista (21610).

**Alcance medido:** 5 reinicios sobre 3 leads en 8 días; 2 leads más con "hola" posterior a su opt-out
en riesgo latente. Volumen bajo, pero es la única violación de política inequívoca del período.

**Fix sugerido:** mover el chequeo `hasOptedOut(lead)` **por encima** de la rama de reinicio, y sacar
`hola/buenas` de `isRestartRequest` para leads con opt-out (que un re-ingreso exija la confirmación
explícita que ya existe en `detect-opt-out-reversal.ts`). Un "hola" no es consentimiento.

### 🔴 P0 — El backfill de la lista de supresión nunca se corrió

`messaging_suppressions` tiene **12 filas**, todas escritas por el flujo nuevo desde el 09-10. En la
base hay **80 leads con `status_reason` de opt-out**. El script `scripts/backfill-messaging-suppressions.sql`
existe, es idempotente y nunca se ejecutó.

Verificado contra los rebotes de Twilio: de los 15 destinos con error 21610, **8 no están en
`messaging_suppressions`** (`+50765151884`, `+573017769002`, `DO.1339548894659656`, `+50672041292`,
`DO.915328111648834`, `+50492154981`, `+50241883032`, `+50360512611`). Hoy dependemos de que Twilio nos
frene; si ese teléfono vuelve por otro anuncio y crea un lead nuevo, **le escribimos**.

```bash
psql "$POSTGRES_URL" -f scripts/backfill-messaging-suppressions.sql
```

### 🟠 P1 — El 34,7% de todo el volumen se gasta en gente a la que terminamos rechazando

184 leads `quota_exhausted` consumieron **4.548 mensajes salientes** (24,7 por persona), y el rechazo
llega en promedio en la **pregunta 17,4**. Es el mayor consumidor de volumen del sistema, por encima de
los leads completados (1.321 mensajes, 10,1%).

Desde el ángulo del usuario: contestó ~20 preguntas para que le digan que no hay cupo. Desde el ángulo
de Meta: 4.548 mensajes cuya contraparte más probable es un bloqueo o un reporte. Con el cambio de
objetivo de región como techo duro (memoria del 09-10) este número solo puede crecer.

**Fix sugerido:** adelantar el chequeo de cupo de región/NSE lo antes posible (país + región + edad
suelen bastar) y cortar con un mensaje amable en la pregunta 3-5, no en la 17.

### 🟠 P1 — Loops de geolocalización: hasta 14 veces la misma pregunta

**246 leads (28%)** recibieron al menos un `No reconocí…` / `Primero necesito…`; 458 envíos en total.
Peor caso medido: `¿En qué municipio vives?` enviado **14 veces al mismo lead**, `Primero necesito una
provincia/departamento válido` **13 veces**, `No reconocí ese municipio/cantón en Herrera` **11 veces**.

`MAX_CONSECUTIVE_REPEATS = 3` no lo detiene porque entre repetición y repetición hay un inbound del
usuario (está intentando responder) y porque el texto alterna entre la pregunta y el mensaje de error.

**Fix sugerido:** contador por *pregunta* (no por texto consecutivo): al tercer intento fallido, ofrecer
lista de opciones cerrada, pedir el GPS, o saltar el campo y seguir. Nunca un cuarto intento.

### 🟠 P1 — Nudges de re-engagement de madrugada

15 salientes proactivos (sin inbound previo en 15 min) cayeron fuera de 08:00–21:00 local, incluidos
**00:20, 02:45, 03:04, 03:36, 03:38, 04:48 y 05:01**. Casi todos son
`👋 Hola, notamos que dejaste la inscripción a mitad de camino`. Son pocos, pero un nudge a las 3 de la
mañana es de los disparadores más directos de "reportar como spam".

**Fix sugerido:** ventana horaria en el scheduler — si el `scheduled_at` cae fuera de 08:00–21:00 en la
zona del lead, correrlo a las 09:00 del día siguiente. (El resto del tráfico nocturno —≈300/día— son
respuestas a usuarios que nos escriben de noche; eso está bien y no hay que tocarlo.)

### 🟡 P2 — Duplicados exactos que el dedupe no atrapa

23 mensajes idénticos reenviados al mismo lead en menos de 10 segundos, sobre 14 leads. `dedupeRepeat`
solo suprime por debajo de 4 s. Subir la ventana a ~15 s.

### 🟡 P2 — Atribución de anuncio: sigue sin capturarse (punto 3.4 de la auditoría anterior)

766 de 868 leads tienen `acquisition_source` en NULL. Lo único poblado viene del ruteo por número
(`whatsapp:number:Ecuador` 69, `whatsapp:number:México` 32). **Sin los campos CTWA de Twilio
(`ReferralBody`, `Headline`, `SourceId`/`ctwa_clid`) no podemos decirle a Meta qué creativo generaba la
fricción ni demostrar que lo pausamos** — es el paso 2 de su checklist de apelación.

### 🟢 Mejoró — Ruteo multi-número parcialmente activo

El tráfico ya se reparte entre 3 números (85,4% / 10,6% / 4,1%), contra 99,6% en un solo número la
semana pasada. Sigue conviniendo repartir más, pero solo junto con la baja de volumen: el flag de
calidad es de cuenta, no de número.

---

## 4. Lo que NO encontramos (importante para no perder tiempo)

- **No hay blasting a números fríos.** 99,4% de los leads escribieron primero; solo 5 de 868 nunca
  respondieron.
- **No hay envíos fuera de la ventana de 24 h** (cero errores 63016).
- **No hay plantillas rechazadas** (pero sí de marketing — ver §6).
- **No hay reenvío del saludo:** los 866 leads que lo recibieron lo recibieron **exactamente una vez**.
- **No hay ráfagas:** un solo caso de 5 salientes consecutivos sin respuesta del usuario en 8 días.
- **No hay rate limiting sistémico:** 1 error 63018 y 1 error 14107 en toda la ventana.

---

## 6. Reconciliación con el análisis de Meta Business Manager (2026-09-16)

Un análisis paralelo hecho sobre la consola de Meta aportó tres datos que no son visibles desde
nuestra base ni desde Twilio, y **corrigió un error de esta auditoría**:

| Dato del análisis de Meta | Veredicto |
|---|---|
| Las plantillas de reenganche son categoría **MARKETING** | ✅ **Correcto — nosotros nos equivocamos.** 27 de 30. |
| El **+1 786-933-7825 está en calidad "Baja"**; los otros dos en "Alta" | ✅ Nuevo y valioso. Coincide con que concentra el 85,4% del saliente. |
| Primera infracción, sin historial previo; ventana de apelación al 15-dic-2026 | ✅ Nuevo. |
| Existe una secuencia automática de reenganche multi-toque | ✅ Existió — **pero dejó de correr el 2026-09-01.** Ver abajo. |
| Recomendación: pausar los recordatorios de fase 2 y 4 en ese número | ⚠️ Apunta a algo que ya casi no se envía. |

### 6.1 La secuencia multi-toque existió, y ya está apagada

`a{intento}_v{variante}` — `a1/a2/a3` son **intentos**, `v1/v2/v3` son variantes de copy del mismo
intento (9 plantillas por pool). Con `MAX_REENGAGEMENT_ATTEMPTS = 1` solo `a1_*` es alcanzable hoy.

Los jobs de re-engage efectivamente entregados (`re_engagement_schedules.delivered_at`, 30 días)
muestran el corte con precisión de día:

| Período | Intento 1 | Intentos 2 y 3 |
|---|---|---|
| 2026-08-18 → 09-01 | ~600 | **98** |
| 2026-09-02 → 09-16 | ~500 | **0** |

El último intento 2 o 3 se entregó el **2026-09-01**, y desde entonces no hubo ni uno. Coincide con
el deploy del fix de scoping de re-engagement. Lo mismo se ve en los textos: `phase1_reengage_a2_v1`
("Todavía tienes tiempo de unirte…") tiene 39 envíos, todos entre el 19-ago y el 01-sep.

**Conclusión:** el mecanismo que describe el análisis de Meta es real y es muy probablemente la causa
de la caída de calidad — plantillas MARKETING, con lenguaje de urgencia, a gente que ya no respondía.
Pero está **dentro de la ventana de 30 días de Meta y fuera de nuestro presente operativo**. Pausarlo
hoy no cambia nada porque ya está pausado desde hace dos semanas. Esto es una buena noticia para la
apelación: es un problema con fecha de inicio, fecha de fin y evidencia en la base.

### 6.2 Dónde está realmente el volumen hoy

Sobre 30 días, **67.571 mensajes salientes**. Todo el reenganche junto suma **245 envíos = 0,36%**:

| Plantilla | Envíos (30d) |
|---|---|
| `phase1_reengage_a1_v1` | 200 |
| `phase1_reengage_a2_v1` (apagada desde el 01-sep) | 39 |
| `phase4_ficha_hogar_a1_*` | 4 |
| `phase1_reengage_a1_v2` | 2 |
| `phase2_link_reminder_*` | 6 (a **1** solo lead) |

El 99,6% restante es el flujo conversacional de encuesta. Por eso la recomendación de "pausar fase 2 y
fase 4" no mueve la aguja: fase 2 le llegó a un lead y fase 4 a cuatro. **La palanca de volumen sigue
siendo el §3 de esta auditoría: el 34,7% que se gasta en leads que terminamos rechazando por cupo.**

### 6.3 Qué conviene hacer con las plantillas `a2_*` y `a3_*`

Están aprobadas y visibles en Meta aunque el código ya no las pueda disparar. Cualquiera que audite la
cuenta —incluido un revisor de Meta— ve una cadena de 3 toques con "Último recordatorio" y
"¿Lo dejamos?" y saca la misma conclusión que sacó este análisis. Conviene **borrarlas de Meta**, no
solo dejarlas sin uso: hace legible la remediación y evita que un futuro cambio de
`MAX_REENGAGEMENT_ATTEMPTS` las reactive en silencio.

---

## 5. Plan sugerido (orden)

1. **Hoy — P0 código:** invertir el orden `hasOptedOut` / reinicio en `flow-router.ts` y endurecer
   `isRestartRequest` para leads dados de baja.
2. **Hoy — P0 datos:** correr `scripts/backfill-messaging-suppressions.sql` contra Neon (68 contactos
   con opt-out histórico hoy desprotegidos).
3. **Esta semana — P1:** adelantar el corte por cupo (−35% de volumen de un solo golpe), cerrar los
   loops de geo al tercer intento, y ventana horaria 08:00–21:00 para los nudges.
4. **Esta semana — P1:** capturar CTWA en el webhook de Twilio para poder nombrar el creativo en la
   apelación.
5. **Borrar de Meta las plantillas `a2_*` y `a3_*`** de los 3 pools (18 plantillas), que el código ya
   no puede disparar desde el 01-sep (§6.3).
6. **Después:** esperar a que la ventana móvil de calidad del +1 786 recoja el menor volumen y la menor
   fricción, y **recién entonces apelar**, con esta auditoría + la del 09-10 como evidencia del
   antes/después. El argumento central de la apelación es §6.1: la cadena multi-toque de marketing
   existió, tiene fecha de corte verificable (01-sep) y no volvió a enviarse.

---

## Apéndice — consultas y comandos usados

```sql
-- Reinicios posteriores a un opt-out (la violación del §3)
select l.id, l.channel_user_id, ce.created_at optout_en, cm.created_at reinicio_en
from leads l
join consent_events ce on ce.lead_id=l.id and ce.consent_type='opt_out' and ce.decision=false
join conversation_messages cm on cm.lead_id=l.id and cm.direction='out'
     and cm.body like '%Empezamos de nuevo%' and cm.created_at > ce.created_at
where cm.created_at > now() - interval '8 days';

-- Supresiones faltantes vs opt-outs históricos
select (select count(*) from messaging_suppressions) supresiones,
       (select count(*) from leads where status_reason in
         ('user_freetext_opt_out','re_engagement_declined_1st_attempt','re_engagement_declined','twilio_stop')) optouts;

-- Costo de fricción del cupo agotado
select count(*) leads,
       sum((select count(*) from conversation_messages c where c.lead_id=l.id and c.direction='out')) salientes,
       round(avg(l.survey_question_index),1) qidx_al_rechazo
from leads l where l.created_at > now() - interval '8 days' and l.lead_status='quota_exhausted';

-- Nudges proactivos fuera de horario
select count(*) from conversation_messages cm
where cm.direction='out' and cm.created_at > now() - interval '8 days'
  and extract(hour from cm.created_at at time zone 'America/Bogota') not between 8 and 20
  and not exists (select 1 from conversation_messages i where i.lead_id=cm.lead_id and i.direction='in'
                  and i.created_at between cm.created_at - interval '15 minutes' and cm.created_at);
```

```bash
# Twilio: agregados de 8 días (28.175 mensajes, 29 páginas)
GET /2010-04-01/Accounts/$SID/Messages.json?PageSize=1000&DateSent>=2026-09-08
# Twilio: alertas de error del período
GET https://monitor.twilio.com/v1/Alerts?StartDate=2026-09-08&PageSize=1000
```

Todas las consultas a Neon se ejecutaron en transacciones `SET TRANSACTION READ ONLY`.
