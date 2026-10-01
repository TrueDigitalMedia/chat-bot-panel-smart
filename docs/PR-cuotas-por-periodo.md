# Periodos de cuota Q1–Q4 con corte de conseguidos

## Por qué

Las cuotas no tenían dimensión temporal. El objetivo era único por `(país, región, dimensión)` y los
conseguidos se contaban en vivo, all-time. "Cerrar" una cuota significaba editar el tope o apagar el
flag `active`, y eso **borraba el histórico**: no quedaba registro de con qué objetivo se corrió el
trimestre ni de qué leads entraron en él.

## Qué hace

Toda la configuración de cuota y todo lead que califica cuelgan de un **periodo (Q1–Q4) por país**,
con fecha de inicio y fin. Al **cerrar el corte** se congelan objetivo / conseguidos / faltante / %
por región y por línea, y queda la lista de leads del corte descargable en CSV.

Decisiones de producto (acordadas antes de implementar):

1. Periodo **por país** — cada país corre su propio calendario.
2. **Sin periodo abierto el país está cerrado**: no califica ningún lead nuevo, ni por la excepción
   de embarazo o bebé menor a 36 meses.
3. Un **Q nuevo arranca vacío** — los objetivos se cargan a mano o con el Excel. No se copian las
   líneas del Q anterior ni se arrastra el faltante.
4. **Corte inicial**: un periodo abierto por país con las cuotas actuales y los leads ya calificados
   sellados. El comportamiento del bot no cambia.

## Modelo

- **`quota_periods`** — un índice único **parcial** (`WHERE status='open'`) impone "a lo sumo un
  periodo abierto por país" en la base, no solo en código.
- **`quota_targets.period_id` / `quota_region_caps.period_id`** — los índices únicos pasan a
  `(period_id, …)` para que la misma celda pueda existir en Q1 y en Q2. `upsertQuotaTarget` mueve su
  `ON CONFLICT` a la tupla nueva: un desajuste ahí **no lo ve TypeScript**, revienta en runtime.
- **`leads.quota_period_id`** — se sella al calificar, en la misma escritura que
  `quota_matched_dimension`/`quota_matched_value`. Es la única fuente de los conseguidos por periodo
  y el registro per-lead del corte.
- **`quota_period_snapshots`** — el corte congelado, con `scope` `region`|`cell`.

### Por qué el sello y no una ventana de fechas

Las fechas del periodo son **descriptivas** y el motor de decisión no las lee nunca:

1. Editar las fechas re-atribuiría leads y movería los números de un corte ya cerrado.
2. Un lead puede empezar la encuesta en Q1 y calificar en Q2: solo el sello sabe qué cuota consumió.
3. El diseño permite rangos solapados, lo que vuelve ambigua cualquier ventana.

## Panel

- **`/admin/quotas/periodos`** — abrir cuota, ver estado, cerrar corte (confirmación por tipeo de la
  etiqueta) y reabrir.
- **`/admin/quotas/periodos/[id]`** — el corte, con descarga CSV de sus leads. Si el periodo sigue
  abierto se marca como *preliminar*.
- `/admin/quotas` y `/admin/dashboard` ganan filtro `?periodId` (default: periodos abiertos) y un
  aviso rojo por país sin periodo abierto. Un periodo cerrado se ve en solo lectura.

## Hallazgos sobre los datos reales (preexistentes, no introducidos acá)

Verificando el corte aparecieron números que no cuadraban, y el corte ahora los expone en vez de
esconderlos:

- **Excedente** — `conseguidos + faltante` puede superar al objetivo porque el faltante es la suma
  de los déficits **por región**: un excedente en una región no compensa el de otra. Costa Rica leía
  358 / 159 / 255 porque *Area metropolitana III* tiene **objetivo 0 y 56 leads calificados**.
- **Fila "sin región"** — Guatemala tiene **6 leads calificados con `nse_region` nulo**. El corte los
  perdía mientras el CSV los traía (116 vs 122). Ahora aparecen como fila propia y el corte cuadra
  con su propia lista.
- Guatemala tiene además regiones con objetivo 0 y leads dentro (Centro I: 1, Centro II: 33).

## Migración

`0037_quota_periods.sql` — **ya aplicada a prod** (2026-10-01 21:46 UTC):

- 9 periodos "Q4 2026" abiertos, uno por país.
- 372 líneas y 42 topes asignados; **0 filas sin periodo**.
- **1443 leads calificados sellados; 0 sin sellar.**
- Índices únicos reemplazados; un solo periodo abierto por país.

Cada sentencia es idempotente y el archivo re-ejecutable, porque el migrador de Neon va por HTTP
**sin transacción envolvente**.

## ⚠️ Antes de mergear

El código desplegado hoy en prod es el anterior, que inserta en `quota_targets` **sin** `period_id`.
Con la migración ya aplicada, eso viola el `NOT NULL`:

- **Crear** una línea de cuota nueva o un tope de región nuevo desde el panel de prod **falla** hasta
  que esto despliegue (el importador de Excel también).
- **Editar** líneas existentes (objetivo, activar/desactivar) sigue funcionando.
- El **bot no se ve afectado**: lee `quota_targets` por país+región sin filtrar por periodo, y toda
  la configuración quedó dentro del único periodo abierto de cada país.

## Pendiente deliberado

- **La suite de regresión no se corrió**: `resetLeadTables()` y `resetQuotaPeriods()` hacen `DELETE`
  sin condición sobre `leads` y la config de cuota, y `POSTGRES_URL` apunta a prod. Hay que correrla
  contra una rama de Neon.
- **Cerrar/reabrir no se ejercitó contra prod** a propósito: cerrar un periodo detiene el
  reclutamiento de un país real. Está cubierto con tests (`quota-cut-lifecycle.test.ts`:
  idempotencia, orden snapshot→estado, reopen borra el corte).

## Verificación hecha

- `tsc --noEmit` limpio; **917 tests** en verde (incluidos 36 nuevos de periodos/cortes);
  `npm run build` OK.
- Migración verificada contra la base real (conteos de arriba).
- API y páginas probadas con sesión autenticada: validaciones 409 `period_already_open`,
  400 `invalid_date_range` / `invalid_country` / `invalid_period`, 404 en corte inexistente, corte
  preliminar, export xlsx por periodo, y CSV del corte cuadrando con su total (122 = 122).

---
🤖 Generated with [Claude Code](https://claude.com/claude-code)
