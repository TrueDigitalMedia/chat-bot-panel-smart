-- Enable pgvector extension FIRST (before any table DDL)
CREATE EXTENSION IF NOT EXISTS vector;

-- Enums
CREATE TYPE lead_status AS ENUM (
  'incomplete',
  'not_qualified',
  'quota_exhausted',
  'link_sent',
  'waiting_for_code',
  'code_delivered_registered',
  'code_delivered_not_registered',
  'code_delivered_no_response',
  'ficha_hogar_completada',
  'abandono'
);

-- Leads
CREATE TABLE leads (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  channel channel NOT NULL DEFAULT 'telegram',
  channel_user_id VARCHAR(128) NOT NULL,
  channel_username VARCHAR(100),
  telegram_username VARCHAR(100),
  lead_status lead_status NOT NULL DEFAULT 'incomplete',
  current_phase SMALLINT NOT NULL DEFAULT 1,
  survey_question_index SMALLINT NOT NULL DEFAULT 0,
  quota_segment VARCHAR(50),
  score SMALLINT,
  d1_accepted BOOLEAN NOT NULL DEFAULT false,
  d2_accepted BOOLEAN,
  d3_is_shopper BOOLEAN,
  conversation_summary TEXT,
  re_engagement_count SMALLINT NOT NULL DEFAULT 0,
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX leads_telegram_chat_id_idx ON leads (telegram_chat_id);

-- Survey profiles
CREATE TABLE survey_profiles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id UUID NOT NULL REFERENCES leads(id),
  full_name VARCHAR(200),
  country VARCHAR(50),
  state_province VARCHAR(100),
  municipality VARCHAR(100),
  neighborhood VARCHAR(100),
  email VARCHAR(200),
  gender VARCHAR(20),
  education_psh VARCHAR(50),
  cars VARCHAR(10),
  domestic_help BOOLEAN,
  household_size SMALLINT,
  bedrooms SMALLINT,
  shopping_frequency VARCHAR(30),
  shopping_categories JSONB,
  contact_channel VARCHAR(20),
  contact_schedule VARCHAR(30),
  raw_free_text_json JSONB,
  extraction_model VARCHAR(100),
  completed_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX survey_profiles_lead_id_idx ON survey_profiles (lead_id);

-- Flow states
CREATE TABLE flow_states (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id UUID NOT NULL REFERENCES leads(id),
  current_phase SMALLINT NOT NULL DEFAULT 1,
  decision_point VARCHAR(10),
  survey_question_index SMALLINT NOT NULL DEFAULT 0,
  is_in_faq_digression BOOLEAN NOT NULL DEFAULT false,
  digression_resume_index SMALLINT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX flow_states_lead_id_idx ON flow_states (lead_id);

-- Re-engagement schedules
CREATE TABLE re_engagement_schedules (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id UUID NOT NULL REFERENCES leads(id),
  phase SMALLINT NOT NULL,
  attempt_number SMALLINT NOT NULL,
  scheduled_at TIMESTAMPTZ NOT NULL,
  delivered_at TIMESTAMPTZ,
  outcome VARCHAR(20),
  qstash_message_id VARCHAR(100)
);
CREATE UNIQUE INDEX re_engagement_unique_idx ON re_engagement_schedules (lead_id, phase, attempt_number);

-- FAQ entries (vector column added separately for pgvector)
CREATE TABLE faq_entries (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  embedding vector(1536),
  category VARCHAR(50),
  question_hash VARCHAR(64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX faq_entries_embedding_idx ON faq_entries USING hnsw (embedding vector_cosine_ops);

-- System call logs
CREATE TABLE system_call_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id UUID REFERENCES leads(id),
  call_type VARCHAR(50) NOT NULL,
  model VARCHAR(100),
  input_tokens INTEGER,
  output_tokens INTEGER,
  latency_ms INTEGER,
  correlation_id UUID NOT NULL,
  called_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  error TEXT
);
CREATE INDEX system_call_logs_lead_id_idx ON system_call_logs (lead_id);
