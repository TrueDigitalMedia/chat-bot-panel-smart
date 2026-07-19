# Phase 1 Data Model: Ficha Hogar interactiva (Fase 4)

## Nueva tabla: `ficha_hogar_profiles`

| Campo | Tipo | Notas |
|---|---|---|
| `id` | `uuid`, PK | |
| `lead_id` | `uuid NOT NULL REFERENCES leads(id)` | 1:1 con `leads`, mismo patrón que `survey_profiles`. |
| `question_index` | `smallint NOT NULL DEFAULT 0` | Progreso — análogo a `leads.survey_question_index` pero propio de esta tabla (research.md R1). |
| `conflict_of_interest` | `boolean`, nullable | P1 — pregunta de descarte. |
| `has_internet` | `boolean`, nullable | P2. |
| `relationship_to_hoh` | `varchar(20)`, nullable | P3 — uno de: Jefe de Familia / Cónyuge / Hijo/a / Padre/Madre / Otro. |
| `date_of_birth` | `varchar(10)`, nullable | P4 — texto validado `DD/MM/AAAA` (research.md R4). |
| `has_health_condition` | `boolean`, nullable | P5. |
| `unlimited_data_plan` | `boolean`, nullable | P6. |
| `pet_count` | `smallint`, nullable | P7. |
| `completed_at` | `timestamptz`, nullable | Se setea cuando se responden las 7 (o al descartar en P1). |
| `created_at` / `updated_at` | `timestamptz NOT NULL DEFAULT now()` | |

## Cambios a `leads` / enums existentes

| Campo | Cambio |
|---|---|
| `lead_status` (enum) | +`'ficha_hogar_descartado'` (nuevo valor terminal) |

`LeadStatus` (TS) y `leadStatusEnum` (Postgres) deben actualizarse juntos.

## Máquina de estados

```
code_delivered_registered
  ├─→ ficha_hogar_completada    (ya existía)
  ├─→ ficha_hogar_descartado    [NUEVO] (P1 = "Sí", conflicto de interés)
  └─→ abandono                  (ya existía)
```

## Preguntas — texto y tipo (fuente: `docs/WIKI.md` §5, Fase 4)

| # | Campo | Texto | Tipo |
|---|---|---|---|
| 1 | `conflictOfInterest` | "¿Trabajas tú o alguien en tu hogar en publicidad/investigación/medios/industria alimentaria?" | Botón Sí/No — **Sí = descarte** |
| 2 | `hasInternet` | "¿Tienen acceso a internet en tu hogar?" | Botón Sí/No |
| 3 | `relationshipToHoh` | "¿Cuál es tu parentesco con el Jefe de Familia?" | Botón: Jefe de Familia / Cónyuge / Hijo/a / Padre/Madre / Otro |
| 4 | `dateOfBirth` | "¿Cuál es tu fecha de nacimiento? (DD/MM/AAAA)" | Texto libre, extraído vía IA, validado por plausibilidad |
| 5 | `hasHealthCondition` | "¿Tienes alguna condición de salud permanente que no te permita contestar estudios?" | Botón Sí/No |
| 6 | `unlimitedDataPlan` | "¿Tu smartphone cuenta con un plan de datos móviles ilimitado?" | Botón Sí/No |
| 7 | `petCount` | "¿Cuántas mascotas (perros y/o gatos) hay en tu hogar?" | Texto libre, numérico, extraído vía IA |

## Flujo de datos hacia el resumen de IA y Treinta (US3)

```
survey_profiles (Fase 1)  ─┐
                            ├─ merge → prompt de resumen IA → persistTreintaPanelist()
ficha_hogar_profiles       ─┘         (misma función existente, sin cambios de firma —
                                        research.md/plan.md: profile-shaped object ya
                                        soporta spread arbitrario de campos)
```

Si P1 (`conflictOfInterest`) es `true`: el flujo se detiene ahí — no se genera resumen ni se llama `persistTreintaPanelist()`, y el lead transiciona directo a `ficha_hogar_descartado`.

## Extracción vía IA — nuevos schemas

| Campo | Schema (`FIELD_SCHEMAS`, `extract-survey-fields.ts`) |
|---|---|
| `dateOfBirth` | `z.object({ value: z.string().regex(/^\d{2}\/\d{2}\/\d{4}$/).nullable() })`, con validación de plausibilidad post-extracción (no futura, edad 13-100 igual que spec 007) |
| `petCount` | `z.object({ value: z.number().int().min(0).max(50).nullable() })` |

## Edge cases cubiertos por el modelo

- **Descarte tras fases 1-3 completas**: el lead ya está en `code_delivered_registered` (posterior a Fase 3) cuando llega a P1 — transicionar a `ficha_hogar_descartado` en vez de `ficha_hogar_completada` es exactamente lo que separa ambos estados terminales.
- **Fecha de nacimiento inválida/futura**: `handleFichaHogar` re-solicita la pregunta sin avanzar `question_index`, mismo patrón que la validación geográfica de Fase 1.
- **Corrección de una respuesta ya dada**: cubierta por `ficha-hogar-correction.ts` (research.md R3), acotada a las 7 columnas de esta tabla.
- **Leads que ya llegaron a `ficha_hogar_completada` antes del deploy**: no tienen fila en `ficha_hogar_profiles` (tabla nueva, sin backfill) — no se les vuelve a encuestar retroactivamente, consistente con la Assumption del spec.
