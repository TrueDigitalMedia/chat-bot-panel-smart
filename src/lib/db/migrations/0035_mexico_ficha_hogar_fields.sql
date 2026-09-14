-- México Ficha Hogar: internetServiceType (3-option service type, replaces hasInternet's
-- Sí/No for México only — Ecuador/CAM keep using hasInternet unchanged) and widen
-- relationship_to_hoh, which was varchar(20) and can't fit México's longest option
-- ("Pariente de empleada doméstica", 31 chars).
ALTER TABLE "ficha_hogar_profiles" ADD COLUMN "internet_service_type" varchar(30);--> statement-breakpoint
ALTER TABLE "ficha_hogar_profiles" ALTER COLUMN "relationship_to_hoh" SET DATA TYPE varchar(40);
