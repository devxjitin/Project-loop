CREATE TYPE connector_type AS ENUM ('zendesk');
CREATE TYPE connector_status AS ENUM ('pending', 'connected', 'error', 'revoked', 'disconnected');

CREATE TABLE connectors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  type connector_type NOT NULL,
  credentials_ref TEXT,
  status connector_status NOT NULL DEFAULT 'pending',
  subdomain TEXT,
  webhook_secret TEXT NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  sync_cursor TEXT,
  last_synced_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, type)
);

-- OAuth state is short-lived and contains no provider credential.
CREATE TABLE connector_oauth_states (
  state_hash TEXT PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  connector_id UUID NOT NULL REFERENCES connectors(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX connectors_tenant_idx ON connectors (tenant_id, created_at DESC);
CREATE INDEX connectors_polling_idx ON connectors (status, last_synced_at) WHERE status = 'connected';

ALTER TABLE connectors ENABLE ROW LEVEL SECURITY;
ALTER TABLE connectors FORCE ROW LEVEL SECURITY;
ALTER TABLE connector_oauth_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE connector_oauth_states FORCE ROW LEVEL SECURITY;

CREATE POLICY connectors_tenant_isolation ON connectors
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
CREATE POLICY connector_oauth_states_tenant_isolation ON connector_oauth_states
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
