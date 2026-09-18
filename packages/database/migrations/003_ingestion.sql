CREATE TYPE ingestion_status AS ENUM ('pending_upload', 'queued', 'processing', 'completed', 'failed');

CREATE TABLE ingestion_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  status ingestion_status NOT NULL DEFAULT 'pending_upload',
  storage_key TEXT NOT NULL UNIQUE,
  original_filename TEXT NOT NULL,
  content_type TEXT NOT NULL DEFAULT 'text/csv',
  size_bytes BIGINT NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 52428800),
  column_mapping JSONB,
  row_count INTEGER NOT NULL DEFAULT 0,
  error_count INTEGER NOT NULL DEFAULT 0,
  error_log JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

CREATE TABLE feedback_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  ingestion_job_id UUID REFERENCES ingestion_jobs(id) ON DELETE SET NULL,
  source TEXT NOT NULL,
  raw_text TEXT NOT NULL CHECK (char_length(raw_text) > 0),
  author TEXT,
  external_id TEXT,
  source_url TEXT,
  occurred_at TIMESTAMPTZ,
  sentiment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE NULLS NOT DISTINCT (tenant_id, source, external_id)
);

CREATE INDEX ingestion_jobs_tenant_created_idx ON ingestion_jobs (tenant_id, created_at DESC);
CREATE INDEX feedback_items_tenant_created_idx ON feedback_items (tenant_id, created_at DESC);

ALTER TABLE ingestion_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE ingestion_jobs FORCE ROW LEVEL SECURITY;
ALTER TABLE feedback_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback_items FORCE ROW LEVEL SECURITY;

CREATE POLICY ingestion_jobs_tenant_isolation ON ingestion_jobs
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
CREATE POLICY feedback_items_tenant_isolation ON feedback_items
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
