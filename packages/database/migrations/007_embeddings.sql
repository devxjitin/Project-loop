CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE feedback_embeddings (
  feedback_item_id UUID PRIMARY KEY REFERENCES feedback_items(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  text_hash TEXT NOT NULL,
  embedding vector(1536) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX feedback_embeddings_tenant_idx ON feedback_embeddings (tenant_id);
CREATE INDEX feedback_embeddings_cosine_hnsw_idx ON feedback_embeddings USING hnsw (embedding vector_cosine_ops);

ALTER TABLE feedback_embeddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback_embeddings FORCE ROW LEVEL SECURITY;
CREATE POLICY feedback_embeddings_tenant_isolation ON feedback_embeddings
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
