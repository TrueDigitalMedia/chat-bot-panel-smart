# Contract: Mexico NSE Scoring (AMAI-style)

**Module**: `src/lib/scoring/mexico-nse.ts` · **Data**: `data/scoring/mexico-nse.json` ·
**Source of truth**: `docs/mexico/Muestra Regiones NSE Mexico.xlsx`

## Function

```ts
export function computeMexicoNse(answers: {
  educationHoh?: string
  fullBathrooms?: string
  vehicleCount?: string
  homeInternet?: string
  workers14Plus?: string
  bedrooms?: string
}): { points: number; level: 'AB' | 'C+' | 'C' | 'D+' | 'D/E'; contributions: Record<string, number> }
```

## Algorithm

1. For each of the 6 variables, look up the answer string in its point table. Unknown / missing /
   "No sé, no recuerdo" → 0.
2. `points` = sum of the 6 contributions.
3. `level` = first `levelCutoffs` entry with `points <= maxPoints`:
   `≤99 → "D/E"`, `100–140 → "D+"`, `141–167 → "C"`, `168–201 → "C+"`, `202+ → "AB"`.
   (The workbook's lowest band is labelled "6–99"; totals below 6 floor to `"D/E"` — research R5.)

## Point tables (option → points)

**Escolaridad del jefe/jefa de hogar**: `Sin instrucción escolar` 0 · `Alfabetizado sin escuela
formal` 0 · `Primaria incompleta` 6 · `Primaria completa` 11 · `Secundaria incompleta` 12 ·
`Secundaria completa` 18 · `Prepa/Bachillerato/Carrera incompleta` 23 · `Prepa/Bachillerato/Carrera
completa` 27 · `Licenciatura incompleta` 36 · `Licenciatura completa` 59 · `Posgrado incompleto` 85 ·
`Posgrado completo / Diplomado / Maestría / Doctorado` 85

**Baños completos con regadera y W.C.**: `0` 0 · `1` 24 · `2 o más` 47

**Automóviles o camionetas**: `0` 0 · `1` 22 · `2 o más` 43

**Internet fijo en la vivienda** (excludes mobile-only): `No tiene` 0 · `Sí tiene` 32

**Personas de 14+ que trabajaron el último mes**: `0` 0 · `1` 15 · `2` 31 · `3` 46 · `4 o más` 61

**Cuartos que se usan para dormir**: `0` 0 · `1` 8 · `2` 16 · `3` 24 · `4 o más` 32

## Test vectors (`tests/unit/mexico-nse.test.ts`)

| Case | Answers | points | level |
|------|---------|--------|-------|
| Workbook sample | Primaria completa (11), 1 baño (24), 0 autos (0), Sin internet (0), 3 trabajaron (46), 3 cuartos (24) | 105 | D+ |
| D/E ceiling | combo summing to 99 | 99 | D/E |
| D+ floor | combo summing to 100 | 100 | D+ |
| D+ ceiling | 140 | 140 | D+ |
| C floor | 141 | 141 | C |
| C ceiling | 167 | 167 | C |
| C+ floor | 168 | 168 | C+ |
| C+ ceiling | 201 | 201 | C+ |
| AB floor | 202 | 202 | AB |
| All-missing | `{}` | 0 | D/E |

## Logging

Emit `nse_score` structured log (see data-model.md §6) on every computation, `country: "México"`.
