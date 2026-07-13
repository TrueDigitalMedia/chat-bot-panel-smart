-- Treinta-owned panelist snapshots (not sent to PanelSmart)
CREATE TABLE treinta_panelist_records (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id UUID NOT NULL REFERENCES leads(id),
  data JSONB NOT NULL,
  summary TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX treinta_panelist_records_lead_id_idx ON treinta_panelist_records (lead_id);

-- Embeddings for Treinta panelist records (pgvector)
CREATE TABLE treinta_panelist_embeddings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  record_id UUID NOT NULL REFERENCES treinta_panelist_records(id),
  embedding vector(1536) NOT NULL,
  embedding_model VARCHAR(100) NOT NULL,
  source_text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX treinta_panelist_embeddings_record_id_idx ON treinta_panelist_embeddings (record_id);
CREATE INDEX treinta_panelist_embeddings_embedding_idx
  ON treinta_panelist_embeddings USING hnsw (embedding vector_cosine_ops);
