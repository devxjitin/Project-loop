CREATE TABLE password_reset_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX password_reset_tokens_active_idx ON password_reset_tokens (user_id, expires_at) WHERE used_at IS NULL;
ALTER TABLE password_reset_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE password_reset_tokens FORCE ROW LEVEL SECURITY;

-- Anonymous reset requests are intentionally fixed-shape: callers learn
-- neither whether an email exists nor any user data.
CREATE OR REPLACE FUNCTION request_password_reset(p_email TEXT, p_token_hash TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE target_user UUID;
BEGIN
  SELECT id INTO target_user FROM public.users WHERE email = lower(trim(p_email)) LIMIT 1;
  IF target_user IS NULL THEN RETURN FALSE; END IF;
  UPDATE public.password_reset_tokens SET used_at = now() WHERE user_id = target_user AND used_at IS NULL;
  INSERT INTO public.password_reset_tokens (user_id, token_hash, expires_at) VALUES (target_user, p_token_hash, now() + interval '1 hour');
  RETURN TRUE;
END;
$$;
REVOKE ALL ON FUNCTION request_password_reset(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION request_password_reset(TEXT, TEXT) TO PUBLIC;

-- Atomically consume exactly one valid token and update the password hash.
CREATE OR REPLACE FUNCTION consume_password_reset(p_token_hash TEXT, p_password_hash TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE target_user UUID;
BEGIN
  SELECT user_id INTO target_user FROM public.password_reset_tokens
  WHERE token_hash = p_token_hash AND used_at IS NULL AND expires_at > now()
  FOR UPDATE;
  IF target_user IS NULL THEN RETURN FALSE; END IF;
  UPDATE public.users SET password_hash = p_password_hash WHERE id = target_user;
  UPDATE public.password_reset_tokens SET used_at = now() WHERE token_hash = p_token_hash;
  RETURN TRUE;
END;
$$;
REVOKE ALL ON FUNCTION consume_password_reset(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION consume_password_reset(TEXT, TEXT) TO PUBLIC;
