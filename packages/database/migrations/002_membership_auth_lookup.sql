DROP POLICY memberships_tenant_isolation ON memberships;

CREATE POLICY memberships_tenant_isolation ON memberships
  USING (
    tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
    OR user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
  )
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
