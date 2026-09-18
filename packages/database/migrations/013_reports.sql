CREATE TYPE report_status AS ENUM ('generating', 'ready', 'failed');
CREATE TABLE reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  status report_status NOT NULL DEFAULT 'generating',
  content TEXT,
  snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  generated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (period_start <= period_end)
);
CREATE INDEX reports_tenant_created_idx ON reports (tenant_id, created_at DESC);
ALTER TABLE reports ENABLE ROW LEVEL SECURITY; ALTER TABLE reports FORCE ROW LEVEL SECURITY;
CREATE POLICY reports_tenant_isolation ON reports USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid) WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
