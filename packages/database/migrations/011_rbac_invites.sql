CREATE TYPE membership_status AS ENUM ('active', 'pending', 'revoked');
ALTER TABLE memberships ADD COLUMN status membership_status NOT NULL DEFAULT 'active';
CREATE TABLE invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email TEXT NOT NULL, role membership_role NOT NULL DEFAULT 'viewer', token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL, accepted_at TIMESTAMPTZ, revoked_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, email)
);
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY; ALTER TABLE invitations FORCE ROW LEVEL SECURITY;
CREATE POLICY invitations_tenant_isolation ON invitations USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid) WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
