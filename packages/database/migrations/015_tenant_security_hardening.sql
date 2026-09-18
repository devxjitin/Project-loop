-- Keep tenant-scoped reads separate from the narrow "my memberships" lookup
-- used during authentication.  In particular, a tenant-scoped request must
-- never obtain memberships from another tenant just because the caller owns
-- those memberships.
DROP POLICY IF EXISTS memberships_tenant_isolation ON memberships;
CREATE POLICY memberships_tenant_isolation ON memberships
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
CREATE POLICY memberships_own_lookup ON memberships FOR SELECT
  USING (user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid);

-- `users` and `tenants` are now guarded too.  New accounts and organisations
-- are deliberately insertable for sign-up; visibility is always constrained
-- by an active request context and a membership relation.
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenants FORCE ROW LEVEL SECURITY;
CREATE POLICY tenants_insert_for_signup ON tenants FOR INSERT WITH CHECK (true);
CREATE POLICY tenants_current_member_read ON tenants FOR SELECT
  USING (
    id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
    AND EXISTS (
      SELECT 1 FROM memberships
      WHERE memberships.tenant_id = tenants.id
        AND memberships.user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
    )
  );

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE users FORCE ROW LEVEL SECURITY;
CREATE POLICY users_insert_for_signup ON users FOR INSERT WITH CHECK (true);
CREATE POLICY users_current_tenant_read ON users FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM memberships
      WHERE memberships.user_id = users.id
        AND memberships.tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
    )
  );

-- Authentication is the only legitimate pre-session user lookup.  Keep that
-- privilege behind a deliberately small, fixed-shape function rather than
-- leaving the entire users table readable without tenant context.
CREATE OR REPLACE FUNCTION authentication_user_by_email(p_email TEXT)
RETURNS TABLE (id UUID, password_hash TEXT)
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT u.id, u.password_hash
  FROM public.users AS u
  WHERE u.email = lower(trim(p_email))
  LIMIT 1;
$$;
REVOKE ALL ON FUNCTION authentication_user_by_email(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION authentication_user_by_email(TEXT) TO PUBLIC;

-- Materialized views cannot have RLS.  Revoke their direct access and expose
-- only context-filtered views to the application role.
REVOKE ALL ON analytics_sentiment_daily, analytics_theme_counts, analytics_channel_counts FROM PUBLIC;
CREATE OR REPLACE VIEW tenant_analytics_sentiment_daily AS
  SELECT * FROM analytics_sentiment_daily
  WHERE tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid;
CREATE OR REPLACE VIEW tenant_analytics_theme_counts AS
  SELECT * FROM analytics_theme_counts
  WHERE tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid;
CREATE OR REPLACE VIEW tenant_analytics_channel_counts AS
  SELECT * FROM analytics_channel_counts
  WHERE tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid;

-- This is the sole anonymous access path for a shared report.  It accepts
-- only a token digest and returns only the report payload intended for the
-- public viewer; the request path no longer needs a BYPASSRLS connection.
CREATE OR REPLACE FUNCTION public_report_by_token(p_token_hash TEXT)
RETURNS TABLE (
  id UUID,
  period_start DATE,
  period_end DATE,
  content TEXT,
  snapshot JSONB,
  generated_at TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT r.id, r.period_start, r.period_end, r.content, r.snapshot, r.generated_at
  FROM public.share_tokens AS s
  JOIN public.reports AS r ON r.id = s.report_id
  WHERE s.token_hash = p_token_hash
    AND s.revoked_at IS NULL
    AND (s.expires_at IS NULL OR s.expires_at > now())
    AND r.status = 'ready'
  LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public_report_by_token(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public_report_by_token(TEXT) TO PUBLIC;
