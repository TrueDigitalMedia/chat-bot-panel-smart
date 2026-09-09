# Contract: Ecuador NSE Scoring

**Module**: `src/lib/scoring/ecuador-nse.ts` · **Data**: `data/scoring/ecuador-nse.json` ·
**Source of truth**: `docs/ecuador/flujo_kantar_ecuador.md` §5 (Kantar IA, supersedes the
earlier `Muestra Regiones NSE Ecuador.xlsx` level grouping).

## Function

```ts
export function computeEcuadorNse(answers: {
  healthInsurancePsh?: string
  monthlyIncome?: string
  dwellingFinishes?: string
  floorMaterial?: string
  vehicleCount?: string
  occupationPsh?: string
  educationPsh?: string
  internetAccess?: string
}): { points: number; level: 'A' | 'B' | 'C' | 'D' | 'E'; contributions: Record<string, number> }
```

## Algorithm

1. For each variable, look up the answer string in its point table (below). Unknown / missing / "No sé,
   no recuerdo" → 0.
2. Occupation = `points(occupationPsh)` — a single "principal sostén del hogar" question (doc Q19).
3. `points` = sum of the 8 contributions.
4. `level` = first `levelCutoffs` entry with `points <= maxPoints` — the official 5-level
   scale (doc §5.2): `0–30 → "E"`, `31–50 → "D"`, `51–75 → "C"`, `76–90 → "B"`, `91+ → "A"`.
   The `AB / C / D/E` grouping from the long lookup table is discarded.

## Point tables (option → points)

**Seguro de salud del PSH**: `Ninguno` 0 · `IESS` 2 · `Issfa` 6 · `Isspol` 6 · `Privada` 10

**Ingresos del hogar mensuales**: `Hasta $400` 1 · `$401-$700` 2 · `$701-$1.000` 3 · `$1.001-$2.000`
4 · `$2.001-$3.000` 5 · `Más de $3.000` 6

**Acabados de la vivienda**: `Tabla/madera, techo desechos o cartón` 0 · `Tabla/madera, techo eternit
o zinc` 3 · `Cemento, techo eternit o zinc` 6 · `Cemento/ladrillo, techo loza o teja` 9 · `Otro
(acabados de lujo)` 12

**Material de piso predominante**: `Duela/parquet/tablón/flotante` 10 · `Cerámica/baldosa/vinil/
marmetón` 7 · `Ladrillo o cemento` 4 · `Tierra/caña` 2 · `Otros materiales` 0

**Número de vehículos**: `0` 0 · `1` 6 · `2` 9 · `3` 12 · `4 o más` 14

**Ocupación del PSH** (`occupationPsh`): `Directivo admón. pública/empresas` 13 · `Profesionales
científicos e intelectuales` 12 · `Técnicos y profesionales de nivel medio` 9 · `Empleados de
oficina` 6 · `Trabajadores de servicios y comerciantes` 4 · `Trabajadores calificados agropecuarios y
pesqueros` 3 · `Oficiales, operarios y artesanos` 3 · `Operadores de instalaciones y máquinas` 4 ·
`Trabajadores no calificados` 0 · `Fuerzas Armadas` 8 · `Desocupados` 1 · `Inactivos/Jubilado` 3

**Máxima educación del PSH**: `Ninguno / No alfabetizado` 0 · `Alfabetizado (sin escuela formal)` 1 ·
`Básica incompleta` 3 · `Básica completa` 4 · `Media incompleta` 5 · `Media completa` 6 · `Técnica
incompleta` 8 · `Técnica completa` 10 · `Universidad incompleta` 12 · `Universidad completa` 15 ·
`Post grado incompleto` 20 · `Post grado completo` 20

**Internet**: `No internet` 0 · `Internet de celular` 3 · `Internet hogar (cable)` 8 · `Internet hogar
(fibra óptica)` 15

## Test vectors (`tests/unit/ecuador-nse.test.ts`)

| Case | Expected points | level |
|------|-----------------|-------|
| Workbook sample household (Issfa, $701–$1.000, Cemento/eternit, Ladrillo o cemento, 0 vehículos, Técnico nivel medio, Universidad completa, Fibra óptica) | 58 | C |
| E ceiling | 30 | E |
| D band | 31–50 | D |
| C band | 51–75 | C |
| B band | 76–90 | B |
| A band | 91+ | A |
| Theoretical max | 100 | A |
| All-missing `{}` | 0 | E |

## Logging

Emit `nse_score` structured log (see data-model.md §6) on every computation.
