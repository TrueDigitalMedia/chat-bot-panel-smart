-- Feature 014: Ecuador onboarding.
-- Adds the columns Ecuador (and future non-CAM countries) need on survey_profiles:
-- raw per-variable scoring answers, the NSE point total, and the Phase-1
-- sensitive-industry screening flag. CAM leaves these null and keeps using its
-- existing typed columns (education_psh, cars, domestic_help, household_size,
-- bedrooms, score) — zero behavior change for existing countries.
ALTER TABLE "survey_profiles" ADD COLUMN "conflict_of_interest" boolean;--> statement-breakpoint
ALTER TABLE "survey_profiles" ADD COLUMN "scoring_answers_json" jsonb;--> statement-breakpoint
ALTER TABLE "survey_profiles" ADD COLUMN "nse_points" smallint;
