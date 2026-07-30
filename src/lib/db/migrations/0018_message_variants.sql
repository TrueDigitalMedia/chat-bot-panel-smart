CREATE TYPE "public"."channel" AS ENUM('telegram', 'whatsapp', 'web');--> statement-breakpoint
CREATE TYPE "public"."lead_status" AS ENUM('incomplete', 'not_qualified', 'quota_exhausted', 'link_sent', 'waiting_for_code', 'code_delivered_registered', 'code_delivered_not_registered', 'code_delivered_no_response', 'ficha_hogar_completada', 'ficha_hogar_descartado', 'abandono');--> statement-breakpoint
CREATE TYPE "public"."message_content_type" AS ENUM('text', 'callback', 'contact', 'keyboard', 'video', 'system');--> statement-breakpoint
CREATE TYPE "public"."message_direction" AS ENUM('in', 'out');--> statement-breakpoint
CREATE TABLE "conversation_evals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid NOT NULL,
	"fixture_id" uuid,
	"correlation_id" uuid,
	"reason" varchar(80) NOT NULL,
	"overall_score" smallint NOT NULL,
	"passed" boolean NOT NULL,
	"checks" jsonb NOT NULL,
	"actual" jsonb NOT NULL,
	"expected" jsonb NOT NULL,
	"mismatches" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"eval_version" varchar(20) DEFAULT 'v1' NOT NULL,
	"ran_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversation_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid NOT NULL,
	"direction" "message_direction" NOT NULL,
	"channel" "channel" NOT NULL,
	"content_type" "message_content_type" DEFAULT 'text' NOT NULL,
	"body" text NOT NULL,
	"meta" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "eval_fixtures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" varchar(80) NOT NULL,
	"description" text NOT NULL,
	"scenario_type" varchar(60) NOT NULL,
	"input_snapshot" jsonb NOT NULL,
	"expected" jsonb NOT NULL,
	"tags" jsonb,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "eval_fixtures_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "faq_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"question" text NOT NULL,
	"answer" text NOT NULL,
	"category" varchar(50),
	"question_hash" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ficha_hogar_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid NOT NULL,
	"question_index" smallint DEFAULT 0 NOT NULL,
	"conflict_of_interest" boolean,
	"has_internet" boolean,
	"relationship_to_hoh" varchar(20),
	"date_of_birth" varchar(10),
	"has_health_condition" boolean,
	"unlimited_data_plan" boolean,
	"pet_count" smallint,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "flow_states" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid NOT NULL,
	"current_phase" smallint DEFAULT 1 NOT NULL,
	"decision_point" varchar(10),
	"survey_question_index" smallint DEFAULT 0 NOT NULL,
	"is_in_faq_digression" boolean DEFAULT false NOT NULL,
	"digression_resume_index" smallint,
	"is_correcting" boolean DEFAULT false NOT NULL,
	"correcting_field" varchar(50),
	"correction_resume_index" smallint,
	"gps_gate_status" varchar(30),
	"gps_proposal" jsonb,
	"pending_wa_choices" jsonb,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lead_message_variant_usage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid NOT NULL,
	"attempt_number" smallint NOT NULL,
	"variant_order" smallint NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel" "channel" DEFAULT 'telegram' NOT NULL,
	"channel_user_id" varchar(128) NOT NULL,
	"channel_username" varchar(100),
	"phone_number" varchar(32),
	"lead_status" "lead_status" DEFAULT 'incomplete' NOT NULL,
	"current_phase" smallint DEFAULT 1 NOT NULL,
	"survey_question_index" smallint DEFAULT 0 NOT NULL,
	"quota_segment" varchar(50),
	"quota_matched_dimension" varchar(20),
	"quota_matched_value" varchar(20),
	"score" smallint,
	"opt_in_accepted" boolean DEFAULT false NOT NULL,
	"d1_accepted" boolean DEFAULT false NOT NULL,
	"d2_accepted" boolean,
	"d3_is_shopper" boolean,
	"conversation_summary" text,
	"re_engagement_count" smallint DEFAULT 0 NOT NULL,
	"last_activity_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"tdm_lead_id" integer,
	"tdm_sync_status" varchar(20),
	"tdm_last_sync_at" timestamp with time zone,
	"tdm_registration_requested_at" timestamp with time zone,
	"tdm_registration_code" varchar(64),
	"panel_smart_sync_status" varchar(20),
	"panel_smart_last_sync_at" timestamp with time zone,
	"panel_smart_synced_answers_json" jsonb
);
--> statement-breakpoint
CREATE TABLE "message_variants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"attempt_number" smallint NOT NULL,
	"variant_order" smallint NOT NULL,
	"template_text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quota_region_caps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"country" varchar(50) NOT NULL,
	"region" varchar(100) NOT NULL,
	"cap_count" integer,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quota_targets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"country" varchar(50) NOT NULL,
	"region" varchar(100) NOT NULL,
	"dimension_type" varchar(20) NOT NULL,
	"dimension_value" varchar(20) NOT NULL,
	"target_count" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "re_engagement_schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid NOT NULL,
	"phase" smallint NOT NULL,
	"attempt_number" smallint NOT NULL,
	"scheduled_at" timestamp with time zone NOT NULL,
	"delivered_at" timestamp with time zone,
	"outcome" varchar(20),
	"qstash_message_id" varchar(100)
);
--> statement-breakpoint
CREATE TABLE "survey_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid NOT NULL,
	"full_name" varchar(200),
	"country" varchar(50),
	"state_province" varchar(100),
	"municipality" varchar(100),
	"neighborhood" varchar(100),
	"nse_region" varchar(100),
	"geo_source" varchar(20),
	"in_quota_geo" boolean,
	"email" varchar(200),
	"gender" varchar(20),
	"education_psh" varchar(50),
	"cars" varchar(10),
	"domestic_help" boolean,
	"household_size" smallint,
	"bedrooms" smallint,
	"shopping_frequency" varchar(30),
	"shopping_categories" jsonb,
	"contact_channel" varchar(20),
	"contact_schedule" varchar(30),
	"raw_free_text_json" jsonb,
	"extraction_model" varchar(100),
	"completed_at" timestamp with time zone,
	"age" smallint,
	"is_pregnant" boolean,
	"has_baby_under_3" boolean
);
--> statement-breakpoint
CREATE TABLE "system_call_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid,
	"call_type" varchar(50) NOT NULL,
	"model" varchar(100),
	"input_tokens" integer,
	"output_tokens" integer,
	"latency_ms" integer,
	"correlation_id" uuid NOT NULL,
	"called_at" timestamp with time zone DEFAULT now() NOT NULL,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "treinta_panelist_embeddings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"record_id" uuid NOT NULL,
	"embedding_model" varchar(100) NOT NULL,
	"source_text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "treinta_panelist_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid NOT NULL,
	"data" jsonb NOT NULL,
	"summary" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "conversation_evals" ADD CONSTRAINT "conversation_evals_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_evals" ADD CONSTRAINT "conversation_evals_fixture_id_eval_fixtures_id_fk" FOREIGN KEY ("fixture_id") REFERENCES "public"."eval_fixtures"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_messages" ADD CONSTRAINT "conversation_messages_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ficha_hogar_profiles" ADD CONSTRAINT "ficha_hogar_profiles_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flow_states" ADD CONSTRAINT "flow_states_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_message_variant_usage" ADD CONSTRAINT "lead_message_variant_usage_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "re_engagement_schedules" ADD CONSTRAINT "re_engagement_schedules_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survey_profiles" ADD CONSTRAINT "survey_profiles_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "system_call_logs" ADD CONSTRAINT "system_call_logs_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "treinta_panelist_embeddings" ADD CONSTRAINT "treinta_panelist_embeddings_record_id_treinta_panelist_records_id_fk" FOREIGN KEY ("record_id") REFERENCES "public"."treinta_panelist_records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "treinta_panelist_records" ADD CONSTRAINT "treinta_panelist_records_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "conversation_evals_lead_ran_idx" ON "conversation_evals" USING btree ("lead_id","ran_at");--> statement-breakpoint
CREATE INDEX "conversation_evals_passed_idx" ON "conversation_evals" USING btree ("passed");--> statement-breakpoint
CREATE INDEX "conversation_messages_lead_created_idx" ON "conversation_messages" USING btree ("lead_id","created_at");--> statement-breakpoint
CREATE INDEX "eval_fixtures_scenario_idx" ON "eval_fixtures" USING btree ("scenario_type");--> statement-breakpoint
CREATE UNIQUE INDEX "ficha_hogar_profiles_lead_id_idx" ON "ficha_hogar_profiles" USING btree ("lead_id");--> statement-breakpoint
CREATE UNIQUE INDEX "lead_variant_usage_lead_attempt_idx" ON "lead_message_variant_usage" USING btree ("lead_id","attempt_number");--> statement-breakpoint
CREATE INDEX "lead_variant_usage_lead_idx" ON "lead_message_variant_usage" USING btree ("lead_id","attempt_number");--> statement-breakpoint
CREATE INDEX "lead_variant_usage_sent_at_idx" ON "lead_message_variant_usage" USING btree ("sent_at");--> statement-breakpoint
CREATE UNIQUE INDEX "leads_channel_user_idx" ON "leads" USING btree ("channel","channel_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "message_variants_attempt_order_idx" ON "message_variants" USING btree ("attempt_number","variant_order");--> statement-breakpoint
CREATE INDEX "message_variants_attempt_idx" ON "message_variants" USING btree ("attempt_number");--> statement-breakpoint
CREATE UNIQUE INDEX "quota_region_caps_country_region_idx" ON "quota_region_caps" USING btree ("country","region");--> statement-breakpoint
CREATE UNIQUE INDEX "quota_targets_country_region_dim_idx" ON "quota_targets" USING btree ("country","region","dimension_type","dimension_value");--> statement-breakpoint
CREATE UNIQUE INDEX "re_engagement_unique_idx" ON "re_engagement_schedules" USING btree ("lead_id","phase","attempt_number");--> statement-breakpoint
CREATE INDEX "system_call_logs_lead_id_idx" ON "system_call_logs" USING btree ("lead_id");--> statement-breakpoint
CREATE UNIQUE INDEX "treinta_panelist_embeddings_record_id_idx" ON "treinta_panelist_embeddings" USING btree ("record_id");--> statement-breakpoint
CREATE UNIQUE INDEX "treinta_panelist_records_lead_id_idx" ON "treinta_panelist_records" USING btree ("lead_id");