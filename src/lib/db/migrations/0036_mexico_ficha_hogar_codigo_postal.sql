-- México's Código Postal question moved from Phase 1 (survey_profiles.scoring_answers_json,
-- a JSON blob) to Ficha Hogar (Fase 4), matching the doc's actual P2 placement. Ficha Hogar
-- fields are typed columns, not a JSON blob, so it needs its own column here.
ALTER TABLE "ficha_hogar_profiles" ADD COLUMN "codigo_postal" varchar(5);
