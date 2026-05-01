CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filename TEXT NOT NULL,
  original_path TEXT,
  source_path TEXT,
  title TEXT NOT NULL,
  product_family TEXT NOT NULL DEFAULT 'General',
  product_model TEXT NOT NULL DEFAULT '',
  document_type TEXT NOT NULL DEFAULT 'unknown',
  version TEXT NOT NULL DEFAULT '',
  software_version TEXT NOT NULL DEFAULT '',
  revision_date DATE,
  source_hash TEXT NOT NULL UNIQUE,
  page_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'indexed',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS documents_product_family_idx ON documents(product_family);
CREATE INDEX IF NOT EXISTS documents_document_type_idx ON documents(document_type);
CREATE INDEX IF NOT EXISTS documents_revision_date_idx ON documents(revision_date);
CREATE INDEX IF NOT EXISTS documents_status_idx ON documents(status);

CREATE TABLE IF NOT EXISTS document_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  page_number INTEGER NOT NULL,
  raw_text TEXT NOT NULL DEFAULT '',
  ocr_text TEXT NOT NULL DEFAULT '',
  combined_text TEXT NOT NULL DEFAULT '',
  has_images BOOLEAN NOT NULL DEFAULT FALSE,
  has_tables BOOLEAN NOT NULL DEFAULT FALSE,
  extraction_quality_score DOUBLE PRECISION NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(document_id, page_number)
);

CREATE INDEX IF NOT EXISTS document_pages_document_id_idx ON document_pages(document_id);

CREATE TABLE IF NOT EXISTS document_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  page_start INTEGER NOT NULL,
  page_end INTEGER NOT NULL,
  chunk_index INTEGER NOT NULL,
  heading_path TEXT NOT NULL DEFAULT '',
  text TEXT NOT NULL,
  token_count INTEGER NOT NULL DEFAULT 0,
  product_family TEXT NOT NULL DEFAULT 'General',
  product_model TEXT NOT NULL DEFAULT '',
  document_type TEXT NOT NULL DEFAULT 'unknown',
  version TEXT NOT NULL DEFAULT '',
  software_version TEXT NOT NULL DEFAULT '',
  revision_date DATE,
  embedding VECTOR,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS document_chunks_document_id_idx ON document_chunks(document_id);
CREATE INDEX IF NOT EXISTS document_chunks_product_family_idx ON document_chunks(product_family);
CREATE INDEX IF NOT EXISTS document_chunks_document_type_idx ON document_chunks(document_type);
CREATE INDEX IF NOT EXISTS document_chunks_revision_date_idx ON document_chunks(revision_date);
CREATE INDEX IF NOT EXISTS document_chunks_text_fts_idx ON document_chunks
  USING GIN (to_tsvector('english', coalesce(text, '') || ' ' || coalesce(heading_path, '')));

CREATE TABLE IF NOT EXISTS ingestion_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID REFERENCES documents(id) ON DELETE SET NULL,
  filename TEXT NOT NULL DEFAULT '',
  source_path TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'queued',
  error_message TEXT,
  stats JSONB NOT NULL DEFAULT '{}'::jsonb,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ingestion_jobs_status_idx ON ingestion_jobs(status);
CREATE INDEX IF NOT EXISTS ingestion_jobs_created_at_idx ON ingestion_jobs(created_at);

CREATE TABLE IF NOT EXISTS queries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_query TEXT NOT NULL,
  parsed_intent JSONB NOT NULL DEFAULT '{}'::jsonb,
  answer TEXT NOT NULL DEFAULT '',
  confidence DOUBLE PRECISION NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS queries_created_at_idx ON queries(created_at);

CREATE TABLE IF NOT EXISTS query_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  query_id UUID NOT NULL REFERENCES queries(id) ON DELETE CASCADE,
  chunk_id UUID REFERENCES document_chunks(id) ON DELETE SET NULL,
  vector_score DOUBLE PRECISION NOT NULL DEFAULT 0,
  keyword_score DOUBLE PRECISION NOT NULL DEFAULT 0,
  rerank_score DOUBLE PRECISION NOT NULL DEFAULT 0,
  final_rank INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS query_results_query_id_idx ON query_results(query_id);
CREATE INDEX IF NOT EXISTS query_results_chunk_id_idx ON query_results(chunk_id);

CREATE TABLE IF NOT EXISTS feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  query_id UUID REFERENCES queries(id) ON DELETE SET NULL,
  rating TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS feedback_query_id_idx ON feedback(query_id);
CREATE INDEX IF NOT EXISTS feedback_created_at_idx ON feedback(created_at);
