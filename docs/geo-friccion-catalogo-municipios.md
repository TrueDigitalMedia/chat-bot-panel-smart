# Fricción en la validación de geo (provincia / municipio)

> **Estado:** documentado, pendiente de decisión con Producto. No se ha implementado ningún cambio.
> **Origen:** auditoría de conversaciones 2026-09 (ver también [`whatsapp-marketing-templates-migration.md`](whatsapp-marketing-templates-migration.md) y los commits de compliance `b990ce6`, `c32adf3`, `70270c1`, `5a3214c`).

## Resumen

En 30 días, **~2.110 mensajes "No entendí / te vuelvo a preguntar"** afectaron a **930 leads (32% del total)**. El paquete 1 (commit `5a3214c`) atacó el caso genérico. **El mayor volumen bruto restante es geo:** ~1.000 mensajes/mes de "No reconocí ese municipio/provincia".

- `¿En qué municipio vives?` → **537** fallos / 14 días
- `¿En qué provincia/departamento vives?` → **359** fallos / 14 días
- Leads que se quedan **permanentemente atascados** en la pregunta de municipio: **54 de 1.424 (3,8%)**. La fricción (2+ mensajes por intento fallido) golpea a muchos más.

## Cómo funciona hoy

El flujo de captura de geo vive en [`src/lib/conversation/phases/phase-1.ts`](../src/lib/conversation/phases/phase-1.ts) (bloque `hasGeoValidation`, ~línea 415) y valida contra:

- **Guatemala:** dataset curado en [`src/lib/geo/guatemala.ts`](../src/lib/geo/guatemala.ts).
- **Los otros 6 países (CAM + RD):** [`src/lib/geo/country-catalog.ts`](../src/lib/geo/country-catalog.ts), que **deriva sus listas de departamento → municipio del catálogo de regiones NSE de cuotas** ([`data/geo/cam-nse-regions.json`](../data/geo/cam-nse-regions.json)).

El matching es fuzzy ([`src/lib/geo/fuzzy-match.ts`](../src/lib/geo/fuzzy-match.ts)): normaliza acentos/mayúsculas, quita palabras como "municipio"/"departamento", compara por bigramas y sub-cadenas, con umbral `FUZZY_THRESHOLD = 0.72`. Un match no exacto pide confirmación; por debajo del umbral → "No reconocí…" + re-pregunta.

## Causa raíz #1 — el catálogo NSE está muy incompleto para RD y Panamá

Como el catálogo solo contiene municipios que tienen dato NSE, la cobertura real es:

| País | Departamentos | Municipios en catálogo | Municipios reales (aprox.) |
|---|---|---|---|
| **Rep. Dominicana** | 22 | **49** (~2 por provincia) | ~160 municipios + ~230 distritos municipales |
| **Panamá** | 9 | **49** | ~80 distritos + cientos de corregimientos |
| **Nicaragua** | 15 | **85** | ~150 |
| **Costa Rica** | 7 | **77** | ~84 cantones |
| Guatemala | 21 | 325 (dataset propio) | ~340 |
| Honduras | 17 | 281 | ~298 |
| El Salvador | 14 | 262 | ~262 |

Los fallos más frecuentes son **lugares reales que simplemente no están en el catálogo**:

| Escrito por el usuario | Veces (14 días) | Qué es |
|---|---|---|
| `distrito nacional` | 28 | **La capital de RD.** No está en el catálogo. |
| `villa mella` | 12 | Sector de Santo Domingo Norte (RD) |
| `distrito central` | 10 | El distrito de Tegucigalpa (HN) |
| `sosúa` / `sosua` | 9 | Municipio de Puerto Plata (RD) |
| `santo domingo este` / `oeste` | 6 | Municipios del Gran Santo Domingo (RD) |
| `24 de diciembre` / `24 diciembre` | 6 | Corregimiento de Panamá |
| `herrera`, `pacora`, `chilibre`, `tocumen`, `las cumbres`, `alcalde díaz`, `caimitillo`, `mañanitas`, `puerto caimito` | 2–7 c/u | Corregimientos de Panamá / municipios RD reales |

**Bug secundario:** hay un typo en el propio catálogo — `Barohona` debería ser `Barahona` ([`data/geo/cam-nse-regions.json`](../data/geo/cam-nse-regions.json)).

## Causa raíz #2 — los usuarios dan la granularidad equivocada

Cuando se pregunta **provincia**, mucha gente responde con su **ciudad/municipio** (se identifican con su ciudad, no con la provincia):

| Escrito en "provincia" | Veces | Es realmente un… |
|---|---|---|
| `la chorrera` / `chorrera` | 9 | municipio (Panamá Oeste) |
| `arraijan` | 4 | municipio (Panamá Oeste) |
| `tegucigalpa` | 4 | municipio (Francisco Morazán) |
| `soyapango`, `ilopango`, `san miguelito` | 3–4 c/u | municipios |
| `san pedro sula`, `la ceiba`, `barahona` | 3–4 c/u | municipios |

## Otras categorías (menores)

- **Coloquialismos de capital:** `capital`, `la capital`, `ciudad capital`, `la misma capital` (~15 casos/14 días).
- **Typos reales:** `altantida` → Atlántida, `cojuetepeque` → Cojutepeque, `cuidad barrios` → Ciudad Barrios, `puerto cabeza` → Puerto Cabezas.
- **Multi-campo en un mensaje:** `nicaragu vivo dn l capitl managua`.
- **Ruido / no-respuestas:** `casa` (7), `si` (6), `ok` (3), `no se`, `eso`, y el texto del opt-in filtrándose (`¡hola! quiero participar y ganar premios.`).

## Impacto downstream de un municipio no reconocido

El municipio se usa para: (1) matching de región NSE / cuota, (2) sync a TDM / Panel Smart. Si el municipio no está en el catálogo NSE **no se puede calcular la región NSE fina**, pero se podría degradar a nivel-departamento en lugar de bloquear la encuesta.

## Opciones de solución (para decidir con Producto)

| # | Cambio | Impacto | Esfuerzo | Riesgo |
|---|---|---|---|---|
| **A** | Respuesta a "provincia" que en realidad es un municipio conocido → aceptar, inferir la provincia padre, pre-llenar municipio y saltar la Q4. | ~40% de los fallos de provincia | Bajo (lógica) | Bajo |
| **B** | Tras el 1er fallo de municipio → mandar los municipios del departamento como **lista de botones** + botón "Otro / no está en la lista". | Long tail de municipios; corta el loop "re-escribí y falló de nuevo" | Medio | Bajo |
| **C** | Tras 2 fallos (o "Otro") → **aceptar el texto crudo**, marcar `geo_needs_review`, seguir la encuesta. Cuota cae a NSE nivel-departamento. | Elimina el 3,8% de stuck permanente + toda la fricción de bucle | Medio (columna/flag nueva + fallback de cuota) | **Producto debe decidir:** ¿se acepta un lead con municipio sin verificar? ¿cómo se cuota? |
| **D** | Mapear coloquialismos de capital (`capital`, `distrito nacional`, `distrito central`, `distrito capital`) → el municipio principal del departamento, por país. | ~10% | Bajo | Bajo |
| **E** | **Expandir el catálogo de RD y Panamá** con una lista canónica de municipios/distritos (fuente pública), manteniendo el mapeo NSE donde existe y NSE=departamento donde no. | La causa raíz #1 | Alto (datos) | Medio — hay que validar el mapeo NSE con el equipo de cuotas |

### Decisiones que necesita Producto antes de implementar

1. **¿Se acepta un lead cuyo municipio no pudo validarse?** (opción C). Si sí: ¿se cuota a nivel departamento, se manda a revisión manual, o se descarta?
2. **¿Vale la pena expandir el catálogo (E)** o alcanza con A + B + C? Expandir implica sourcing de datos y re-validar el mapeo NSE.
3. **Prioridad relativa** frente a los otros paquetes de fricción pendientes (geo, email ~289/mes, parsing trivial de texto a botones).

### Recomendación de ingeniería

Arrancar con **A + B + C** (fixes de flujo, alto impacto, sin dependencia de datos externos). D y E como fase 2. Pero **C requiere una decisión explícita de Producto** sobre qué hacer con un lead de municipio no verificado.

## Referencias de código

- [`src/lib/conversation/phases/phase-1.ts`](../src/lib/conversation/phases/phase-1.ts) — bloque `hasGeoValidation` (~L415)
- [`src/lib/geo/country-catalog.ts`](../src/lib/geo/country-catalog.ts) — validación CAM/RD
- [`src/lib/geo/guatemala.ts`](../src/lib/geo/guatemala.ts) — dataset curado GT
- [`src/lib/geo/fuzzy-match.ts`](../src/lib/geo/fuzzy-match.ts) — matching fuzzy, `FUZZY_THRESHOLD`
- [`data/geo/cam-nse-regions.json`](../data/geo/cam-nse-regions.json) — catálogo NSE (fuente de las listas de municipios)
- [`src/lib/conversation/send-survey-question.ts`](../src/lib/conversation/send-survey-question.ts) — texto de las preguntas de geo
