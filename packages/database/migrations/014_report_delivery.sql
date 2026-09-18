CREATE TYPE report_cadence AS ENUM ('weekly', 'monthly');
CREATE TABLE report_schedules (
  tenant_id UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  cadence report_cadence NOT NULL DEFAULT 'monthly',
  enabled BOOLEAN NOT NULL DEFAULT true,
  last_generated_for DATE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE report_schedules ENABLE ROW LEVEL SECURITY; ALTER TABLE report_schedules FORCE ROW LEVEL SECURITY;
CREATE POLICY report_schedules_tenant_isolation ON report_schedules USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid) WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

CREATE TABLE share_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX share_tokens_report_idx ON share_tokens (report_id);
ALTER TABLE share_tokens ENABLE ROW LEVEL SECURITY; ALTER TABLE share_tokens FORCE ROW LEVEL SECURITY;
CREATE POLICY share_tokens_tenant_isolation ON share_tokens USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid) WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
