-- Spec 018 — cuotas y conseguidos por periodo (Q1-Q4) con corte al cerrar.
--
-- IMPORTANTE: migrate.ts usa el migrator `neon-http`, que manda cada sentencia por HTTPS
-- plano — NO hay transacción envolvente. Un fallo a mitad deja la DB a medias, así que cada
-- sentencia de este archivo es idempotente y el archivo entero es re-ejecutable.
-- 1. El periodo -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS quota_periods (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  country    VARCHAR(50)  NOT NULL,
  label      VARCHAR(40)  NOT NULL,
  year       SMALLINT     NOT NULL,
  quarter    SMALLINT     NOT NULL,
  starts_on  DATE         NOT NULL,
  ends_on    DATE         NOT NULL,
  status     VARCHAR(16)  NOT NULL DEFAULT 'open',
  opened_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  closed_at  TIMESTAMPTZ,
  notes      TEXT,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT quota_periods_quarter_check    CHECK (quarter BETWEEN 1 AND 4),
  CONSTRAINT quota_periods_date_range_check CHECK (ends_on >= starts_on),
  CONSTRAINT quota_periods_status_check     CHECK (status IN ('open', 'closed'))
);
--> statement-breakpoint
-- Lo que realmente impone "a lo sumo un periodo abierto por país". El pre-chequeo en código
-- sirve solo para dar un error lindo; la carrera la ataja este índice (23505).
-- Sin restricción de solapamiento de fechas: son metadata descriptiva y nada en el motor de
-- decisión las lee (los conseguidos se cuentan por leads.quota_period_id).
CREATE UNIQUE INDEX IF NOT EXISTS quota_periods_one_open_per_country_idx
  ON quota_periods (country) WHERE status = 'open';
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS quota_periods_country_label_idx
  ON quota_periods (country, label);
--> statement-breakpoint
-- Redundante con la PK, pero es la clave referenciable de las FK compuestas de más abajo.
CREATE UNIQUE INDEX IF NOT EXISTS quota_periods_id_country_idx
  ON quota_periods (id, country);
--> statement-breakpoint
-- 2. El corte congelado ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS quota_period_snapshots (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  period_id       UUID         NOT NULL REFERENCES quota_periods(id) ON DELETE CASCADE,
  scope           VARCHAR(10)  NOT NULL,
  country         VARCHAR(50)  NOT NULL,
  region          VARCHAR(100) NOT NULL,
  -- '' y no NULL: en Postgres los NULL son distintos entre sí, así que con NULL el índice
  -- único de abajo no chocaría y un cierre reintentado duplicaría las filas de región.
  dimension_type  VARCHAR(20)  NOT NULL DEFAULT '',
  dimension_value VARCHAR(20)  NOT NULL DEFAULT '',
  objective       INTEGER      NOT NULL,
  achieved        INTEGER      NOT NULL,
  missing         INTEGER      NOT NULL,
  progress_pct    INTEGER      NOT NULL,
  source          VARCHAR(10),
  deactivated     BOOLEAN      NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT quota_period_snapshots_scope_check CHECK (scope IN ('region', 'cell'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS quota_period_snapshots_cell_idx
  ON quota_period_snapshots (period_id, scope, region, dimension_type, dimension_value);
--> statement-breakpoint
-- 3. Columnas nuevas, nullable por ahora -------------------------------------------------
ALTER TABLE quota_targets ADD COLUMN IF NOT EXISTS period_id UUID;
--> statement-breakpoint
ALTER TABLE quota_region_caps ADD COLUMN IF NOT EXISTS period_id UUID;
--> statement-breakpoint
ALTER TABLE leads ADD COLUMN IF NOT EXISTS quota_period_id UUID;
--> statement-breakpoint
-- 4. Corte inicial: un periodo ABIERTO por país -----------------------------------------
-- El set de países sale de TRES fuentes. La tercera es la que importa: si saliera solo de las
-- dos tablas de cuota, los leads calificados de un país sin filas de cuota quedarían con
-- quota_period_id NULL y desaparecerían de todo conteo period-scoped — un cambio de
-- comportamiento real el día 1. Las filas de periodo extra son inofensivas.
INSERT INTO quota_periods (country, label, year, quarter, starts_on, ends_on, status)
SELECT c.country,
       'Q' || EXTRACT(quarter FROM CURRENT_DATE)::int || ' ' || EXTRACT(year FROM CURRENT_DATE)::int,
       EXTRACT(year FROM CURRENT_DATE)::int,
       EXTRACT(quarter FROM CURRENT_DATE)::int,
       -- Primer lead del país, no CURRENT_DATE: un periodo que "empieza" después de la mayoría
       -- de los leads que posee parece un bug en el panel. Como nada lee las fechas, un valor
       -- imperfecto acá es puramente cosmético.
       COALESCE(
         (SELECT MIN(l.created_at)::date
            FROM leads l
            JOIN survey_profiles sp ON sp.lead_id = l.id
           WHERE sp.country = c.country),
         CURRENT_DATE
       ),
       (date_trunc('quarter', CURRENT_DATE) + INTERVAL '3 months' - INTERVAL '1 day')::date,
       'open'
  FROM (
         SELECT DISTINCT country FROM quota_targets WHERE country IS NOT NULL
          UNION
         SELECT DISTINCT country FROM quota_region_caps WHERE country IS NOT NULL
          UNION
         SELECT DISTINCT sp.country
           FROM survey_profiles sp
           JOIN leads l ON l.id = sp.lead_id
          WHERE sp.country IS NOT NULL
            AND (l.lead_status IN ('link_sent', 'waiting_for_code', 'code_delivered_registered',
                                   'code_delivered_not_registered', 'code_delivered_no_response',
                                   'ficha_hogar_completada')
                 OR l.quota_matched_dimension IS NOT NULL)
       ) c
 ON CONFLICT (country, label) DO NOTHING;
--> statement-breakpoint
-- 5. Asignar la configuración existente a ese periodo ------------------------------------
UPDATE quota_targets t
   SET period_id = p.id
  FROM quota_periods p
 WHERE p.country = t.country
   AND p.status = 'open'
   AND t.period_id IS NULL;
--> statement-breakpoint
UPDATE quota_region_caps rc
   SET period_id = p.id
  FROM quota_periods p
 WHERE p.country = rc.country
   AND p.status = 'open'
   AND rc.period_id IS NULL;
--> statement-breakpoint
-- 6. NOT NULL + FK (incluida la compuesta que guarda el `country` denormalizado) ---------
-- A propósito NOT NULL: si el paso 4/5 se saltó una fila, la migración se detiene acá y se
-- sabe qué país quedó huérfano, en vez de arrastrar configuración invisible sin periodo.
ALTER TABLE quota_targets ALTER COLUMN period_id SET NOT NULL;
--> statement-breakpoint
ALTER TABLE quota_region_caps ALTER COLUMN period_id SET NOT NULL;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE quota_targets
    ADD CONSTRAINT quota_targets_period_id_quota_periods_id_fk
    FOREIGN KEY (period_id) REFERENCES quota_periods(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE quota_targets
    ADD CONSTRAINT quota_targets_period_country_fk
    FOREIGN KEY (period_id, country) REFERENCES quota_periods(id, country);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE quota_region_caps
    ADD CONSTRAINT quota_region_caps_period_id_quota_periods_id_fk
    FOREIGN KEY (period_id) REFERENCES quota_periods(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE quota_region_caps
    ADD CONSTRAINT quota_region_caps_period_country_fk
    FOREIGN KEY (period_id, country) REFERENCES quota_periods(id, country);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE leads
    ADD CONSTRAINT leads_quota_period_id_quota_periods_id_fk
    FOREIGN KEY (quota_period_id) REFERENCES quota_periods(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
-- 7. Swap de los índices únicos — DESPUÉS del backfill ----------------------------------
-- La misma celda (país, región, dimensión) tiene que poder existir en Q1 y en Q2.
-- OJO: upsertQuotaTarget() emite su ON CONFLICT con esta tupla literal; se mueve a
-- (period_id, region, dimension_type, dimension_value) en el mismo commit.
DROP INDEX IF EXISTS quota_targets_country_region_dim_idx;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS quota_targets_period_region_dim_idx
  ON quota_targets (period_id, region, dimension_type, dimension_value);
--> statement-breakpoint
DROP INDEX IF EXISTS quota_region_caps_country_region_idx;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS quota_region_caps_period_region_idx
  ON quota_region_caps (period_id, region);
--> statement-breakpoint
-- 8. Sellar los leads que ya calificaron -------------------------------------------------
-- El `OR quota_matched_dimension IS NOT NULL` hace completo el export de leads del corte sin
-- alterar ningún conteo (el filtro por lead_status sigue aplicando en las queries). Los leads
-- con survey_profiles.country NULL quedan sin sellar — consistente con countAchievedMap, que
-- ya los descarta hoy.
UPDATE leads l
   SET quota_period_id = p.id
  FROM survey_profiles sp
  JOIN quota_periods p ON p.country = sp.country AND p.status = 'open'
 WHERE sp.lead_id = l.id
   AND l.quota_period_id IS NULL
   AND (l.lead_status IN ('link_sent', 'waiting_for_code', 'code_delivered_registered',
                                   'code_delivered_not_registered', 'code_delivered_no_response',
                                   'ficha_hogar_completada')
        OR l.quota_matched_dimension IS NOT NULL);
--> statement-breakpoint
-- 9. Índices de lectura por periodo ------------------------------------------------------
CREATE INDEX IF NOT EXISTS leads_quota_period_status_idx
  ON leads (quota_period_id, lead_status);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS leads_quota_period_dim_idx
  ON leads (quota_period_id, quota_matched_dimension, quota_matched_value);
