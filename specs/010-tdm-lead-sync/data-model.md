# Phase 1 Data Model: Sync de Leads a TDM (Solo Escritura)

## 1. Local schema change — `leads` (Postgres)

Migration `0013_tdm_mysql_sync.sql` adds three nullable columns to the existing `leads`
table (no new table; this is per-lead sync state, one row per lead already exists):

| Column | Type | Purpose |
|---|---|---|
| `tdm_lead_id` | `INTEGER` | MySQL `AUTO_INCREMENT` id assigned to this lead's row in `tb_leads_agente_ia`. `NULL` until the first successful sync. Used as the idempotency key for all later writes. |
| `tdm_sync_status` | `VARCHAR(20)` | `'synced'` \| `'failed'`, code-managed (no `pgEnum`) — same convention as `flow_states.gps_gate_status`. Reflects only the *last* sync attempt's outcome. |
| `tdm_last_sync_at` | `TIMESTAMPTZ` | Timestamp of the last sync attempt (success or failure), for ops visibility. |

```sql
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS tdm_lead_id INTEGER,
  ADD COLUMN IF NOT EXISTS tdm_sync_status VARCHAR(20),
  ADD COLUMN IF NOT EXISTS tdm_last_sync_at TIMESTAMPTZ;
```

Corresponding additions to `src/lib/db/schema.ts` (`leads` table) and `src/types/lead.ts`
(`Lead` interface): `tdmLeadId: number | null`, `tdmSyncStatus: string | null`,
`tdmLastSyncAt: Date | null`.

No new `pgEnum` — `tdm_sync_status` values are validated only in application code
(`sync.ts`), matching the existing `gpsGateStatus` convention.

## 2. Target row shape — `tb_leads_agente_ia` (TDM's MySQL, external, no DDL access)

`TbLeadsAgenteIaRow` (in `src/lib/tdm-mysql/types.ts`) models only the columns this
feature writes — a partial type, not the full external schema.

### 2a. Always present (config-derived)

| Column | Source |
|---|---|
| `tenant_id` | `env.CLIENT_MYSQL_TENANT_ID` |
| `lead_version` | `env.CLIENT_MYSQL_LEAD_VERSION` |

### 2b. Written on Phase 1 insert, carried through on every later update

| Column | Source | Notes |
|---|---|---|
| `source` | `leads.channel` | |
| `status` | `mapCoarseStatus(leads.leadStatus)` | See §3 |
| `lead_status` | `leads.leadStatus` (raw) | |
| `f1_lead_status` | `leads.leadStatus` at Phase 1 sync time only | Frozen at insert; never overwritten by later updates |
| `created_at` / `updated_at` | `leads.createdAt` / `leads.updatedAt` | |
| `phone` | `leads.phoneNumber` | |
| `lead_score` | `leads.score` | |
| `score_category` | `leads.quotaSegment` | |
| `nombre_completo` | `survey_profiles.fullName` | |
| `correo_electronico` | `survey_profiles.email` | |
| `genero` | `survey_profiles.gender` | |
| `estado_residencia` | `survey_profiles.stateProvince` | |
| `municipio_residencia` | `survey_profiles.municipality` | |
| `kantar_region` | `survey_profiles.nseRegion` | Present in `schema.ts`/DB row; not yet on the `SurveyProfile` TS type — add it there as part of this change (pre-existing gap, unrelated to this feature but required to type the mapper) |
| `automoviles` | `survey_profiles.cars` | |
| `cuartos_dormir` | `survey_profiles.bedrooms` | |
| `frecuencia_compras_hogar` | `survey_profiles.shoppingFrequency` | |
| `metodo_contacto_preferido` | `survey_profiles.contactChannel` | |
| `horario_contacto_preferido` | `survey_profiles.contactSchedule` | |
| `nivel_educacion_jefe_hogar` | `survey_profiles.educationPsh` | |
| `categorias_compras_hogar` | `mapShoppingCategories(survey_profiles.shoppingCategories)` | int[] 1-8 → comma-joined labels via Q14's exact list (§3) |
| `country`, `pais_residencia` | `survey_profiles.country` | Duplicate columns in target schema — both written |
| `servicio_domestico` | `survey_profiles.domesticHelp` | |
| `personas_hogar`, `num_integrantes_hogar` | `survey_profiles.householdSize` | Duplicate columns — both written |
| `edad_ama_casa` | `survey_profiles.age` | Interpretive mapping — code comment flags it, not a verified semantic match (open question for TDM) |
| `embarazo` | `survey_profiles.isPregnant` | |
| `parroquia_residencia`/`provincia_residencia`/`canton_residencia`, `parroquia`/`provincia`/`canton` | `survey_profiles.stateProvince`/`municipality`/`neighborhood` | Generic fallback; country-specific admin-division naming is not refined (spec Out of Scope) |
| `thread_summary` | `leads.conversationSummary` | `NULL` at Phase 1; populated at Ficha Hogar completion |
| `json_raw` | `{...surveyProfile, ...fichaHogarProfile}` | Same combined-object shape already built in `completeFichaHogar` ([phase-4.ts](../../src/lib/conversation/phases/phase-4.ts)); at Phase 1 time, `fichaHogarProfile` doesn't exist yet so it's just `{...surveyProfile}` |

### 2c. Added only by the Ficha Hogar update

| Column | Source |
|---|---|
| `internet_hogar`, `acceso_internet` | `ficha_hogar_profiles.hasInternet` (duplicate columns, both written) |
| `parentesco_jefe_familia` | `ficha_hogar_profiles.relationshipToHoh` |
| `fecha_nacimiento_ama_casa` | `ficha_hogar_profiles.dateOfBirth` (already `DD/MM/AAAA`) |
| `discapacidad_total` | `ficha_hogar_profiles.hasHealthCondition` — interpretive mapping, same caveat as `edad_ama_casa` |
| `plan_datos_ilimitado` | `ficha_hogar_profiles.unlimitedDataPlan` |
| `num_mascotas` | `ficha_hogar_profiles.petCount` |
| `_ficha_hogar_completed_at` | `ficha_hogar_profiles.completedAt` |

### 2d. Discard update

Same row shape as §2b, with `lead_status` = `'ficha_hogar_descartado'` and
`status` = `mapCoarseStatus('ficha_hogar_descartado')` = `'rejected'`. Ficha Hogar
columns (§2c) stay `NULL` — the discard happens on Q1, before any of that data exists.

### 2e. Deliberately left `NULL` (never written by this feature)

`thread_id`, `display_thread_id`, `_extraction_meta`, `_scoring_meta`, `_region_meta`,
`_category_meta`, `_inherited`, `_missing_fields`, `_support_required`,
`byneural_path_status`, `kantar_payload`, `kantar_response`, `kantar_is_success`,
`kantar_panelist_id`, `kantar_error`, `kantar_error_code`, `registration_code` (all
TDM-internal-process-owned — this feature is write-only from the bot's side and never
reads or depends on them), plus any column with no corresponding data on our side
(`banos_completos`, `personas_trabajando`, `seguro_salud`, `material_piso`,
`acabados_vivienda`, `codigo_postal`, `tipo_internet`, `ocupacion_psh`, and the `_ec`
suffixed Ecuador-specific columns).

## 3. Pure mapping functions (`src/lib/tdm-mysql/field-map.ts`, zero I/O)

- **`mapCoarseStatus(leadStatus: LeadStatus): string`** — buckets the detailed
  `LeadStatus` into a `varchar(20)`-safe coarse value:

  ```text
  incomplete, not_qualified, quota_exhausted, ficha_hogar_descartado   → 'rejected'
  link_sent, waiting_for_code                                         → 'active'
  code_delivered_registered, ficha_hogar_completada                   → 'qualified'
  code_delivered_not_registered, code_delivered_no_response, abandono → 'dropped'
  ```

  Best-effort / pending TDM confirmation (documented in spec Assumptions); `lead_status`
  always carries the untruncated detail alongside it so nothing is lost if the bucket
  guess is wrong.

- **`mapShoppingCategories(ids: number[] | null): string | null`** — joins the Q14
  category ids (1-8) to their Spanish labels using the exact list in
  [survey-questions.ts](../../src/lib/conversation/survey-questions.ts) (index 14):
  Canasta básica, Lácteos, Bebidas, Snacks/Botanas, Cuidado personal, Prod. de limpieza,
  Cuidado del bebé, Mascotas. Unknown ids are dropped rather than throwing; `null`/empty
  input → `null`.

- **`buildPhase1InsertRow(lead, surveyProfile): TbLeadsAgenteIaRow`** — §2a + §2b, no
  Ficha Hogar columns.

- **`buildFichaHogarUpdateRow(lead, surveyProfile, fichaHogarProfile, summary): TbLeadsAgenteIaRow`**
  — §2a + §2b (refreshed) + §2c, `thread_summary` populated.

- **`buildDiscardUpdateRow(lead, surveyProfile): TbLeadsAgenteIaRow`** — §2a + §2b with
  the discard `status`/`lead_status` override, §2c omitted (all `NULL`).

## 4. Sync state transitions (local, per lead)

```text
tdm_lead_id = NULL, tdm_sync_status = NULL
        │  syncLeadPhase1Complete() succeeds
        ▼
tdm_lead_id = <MySQL insertId>, tdm_sync_status = 'synced', tdm_last_sync_at = now()
        │  syncLeadFichaHogarComplete() / syncLeadFichaHogarDiscarded()
        │  (UPDATE WHERE id = tdm_lead_id if set, else INSERT — see research.md R3)
        ▼
tdm_sync_status = 'synced' | 'failed' (re-evaluated), tdm_last_sync_at refreshed,
tdm_lead_id set if this was the fallback INSERT path
```

A failed attempt at any stage sets `tdm_sync_status = 'failed'` but never clears an
already-set `tdm_lead_id` — a previously successful Phase 1 sync's id must survive a
later failed Ficha Hogar update so a subsequent retry still targets the right row.
