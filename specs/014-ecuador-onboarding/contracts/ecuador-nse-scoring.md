# Contract: Ecuador NSE Scoring

**Module**: `src/lib/scoring/ecuador-nse.ts` · **Data**: `data/scoring/ecuador-nse.json` ·
**Source of truth**: `docs/ecuador/Muestra Regiones NSE Ecuador.xlsx`

## Function

```ts
export function computeEcuadorNse(answers: {
  healthInsurancePsh?: string
  monthlyIncome?: string
  dwellingFinishes?: string
  floorMaterial?: string
  vehicleCount?: string
  occupationHead?: string
  occupationAma?: string
  educationPsh?: string
  internetAccess?: string
}): { points: number; level: 'AB' | 'C' | 'D/E'; contributions: Record<string, number> }
```

## Algorithm

1. For each variable, look up the answer string in its point table (below). Unknown / missing / "No sé,
   no recuerdo" → 0.
2. Occupation = `max(points(occupationHead), points(occupationAma))` (research R2).
3. `points` = sum of the 8 contributions (occupation counts once).
4. `level` = first `levelCutoffs` entry with `points <= maxPoints`:
   `0–50 → "D/E"`, `51–75 → "C"`, `76+ → "AB"`.

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

**Máxima ocupación (jefe y/o ama)**: `Directivo admón. pública/empresas` 13 · `Profesionales
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

| Case | Answers | Expected points | level |
|------|---------|-----------------|-------|
| Workbook sample household | Issfa, $701–$1.000, Cemento/eternit, Ladrillo o cemento, 0 vehículos, Técnico nivel medio, Universidad completa, Fibra óptica | 58 | C |
| Lower boundary | any combo summing to 50 | 50 | D/E |
| Level bump | any combo summing to 51 | 51 | C |
| Upper boundary | sum 75 | 75 | C |
| AB threshold | sum 76 | 76 | AB |
| All-missing | `{}` | 0 | D/E |
| Occupation max | occupationHead "Trabajadores no calificados" (0), occupationAma "Profesionales científicos" (12) → contributes 12 | — | — |

> The workbook's own sample row shows total **52** because its *Acabados* points cell is blank; with
> the table applied the same household is **58**. Tests assert against the tables, not the 52.

## Logging

Emit `nse_score` structured log (see data-model.md §6) on every computation.
