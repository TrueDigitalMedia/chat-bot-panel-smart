# Phase 1 Data Model: Corrección de la fórmula de scoring SCL-CAM

No se crean tablas ni columnas nuevas. Este documento describe los campos existentes cuyo **dominio de valores** cambia, y las estructuras intermedias de cálculo introducidas en `socioeconomic.ts`.

## Entidades existentes afectadas

### `SurveyProfile` (tabla `survey_profiles`, sin cambios de esquema)

| Campo | Tipo actual | Cambio |
|-------|-------------|--------|
| `educationPsh` | `varchar(50)` / `string \| null` | Dominio de valores válidos pasa de 10 opciones a las 12 oficiales (agrega "No alfabetizado" y "Pos Grado Incompleto"). |
| `gender` | `varchar(20)` / `string \| null` | Dominio de valores válidos pasa de `"Hombre" \| "Mujer"` a `"Masculino" \| "Femenino"`. |
| `cars`, `domesticHelp`, `householdSize`, `bedrooms` | sin cambio de tipo | Sin cambio de dominio; solo cambia cómo se traducen a puntos dentro de `calculateScore`. |

### `Lead` (tabla `leads`, sin cambios de esquema)

| Campo | Tipo actual | Cambio |
|-------|-------------|--------|
| `score` | `smallint` / `number \| null` | Ahora almacena el resultado de la fórmula oficial `(45×NiPSH + 18×HACI + 28×AUTO + 9×SD)/100`, redondeado a entero (ver research.md R2). Rango posible: 0–1000 (antes 0–100). |
| `quotaSegment` | `varchar(50)` / `string \| null` | Dominio de valores válidos pasa de `"A/B" \| "C+" \| "C" \| "D+" \| "D/E"` a `"Nivel 1" \| "Nivel 2" \| "Nivel 3" \| "Nivel 4"`. |

## Estructuras de cálculo internas (no persistidas)

### Tabla NiPSH (nivel educativo del PSH → puntos)

| Nivel educativo | Puntos |
|---|---|
| No alfabetizado | 0 |
| Alfabetizado pero no en escuela normal | 0 |
| Primaria Incompleta | 0 |
| Primaria Completa | 0 |
| Secundaria Incompleta | 250 |
| Secundaria Completa | 250 |
| Bachillerato Incompleto | 250 |
| Bachillerato Completo | 400 |
| Universidad Incompleta | 900 |
| Universidad Completa | 1000 |
| Pos Grado Incompleto | 1000 |
| Pos Grado Completo | 1000 |

### HACI (hacinamiento)

- Fórmula intermedia: `HACI = (10 × personas en el hogar) / dormitorios exclusivos`; si no hay dormitorios exclusivos → `HACI = 99`.
- Mapeo a puntos: `≥25 → 0`, `>15 y <25 → 250`, `≥10 y ≤15 → 500`, `<10 → 1000`.

### AUTO (número de autos)

`0 → 0`, `1 → 650`, `2+ → 1000`.

### SD (servicio doméstico)

`0 → 0`, `1+ → 1000`.

### Clasificación NSE (score SCL → nivel)

`≥540 → Nivel 1`, `>325 y <540 → Nivel 2`, `>180 y ≤325 → Nivel 3`, `≤180 → Nivel 4`.

## Relaciones y flujo de datos

```
SurveyProfile (educationPsh, cars, domesticHelp, householdSize, bedrooms)
        │
        ▼
calculateScore()  →  score: number (0-1000, redondeado)
        │
        ▼
getQuotaSegment(score)  →  quotaSegment: "Nivel 1".."Nivel 4"
        │
        ▼
Lead.score, Lead.quotaSegment  (persistido por phase-1.ts / handle-confirm.ts)
```

No hay nuevas relaciones entre entidades ni nuevos estados en la máquina de estados del lead — esta feature no modifica transiciones de `leadStatus`, solo los valores numéricos/de segmento calculados en el momento de completar la encuesta.
