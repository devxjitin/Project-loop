CREATE TABLE qa_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX qa_sessions_tenant_user_idx ON qa_sessions (tenant_id, user_id, updated_at DESC);

CREATE TYPE qa_message_role AS ENUM ('user', 'assistant');
CREATE TABLE qa_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES qa_sessions(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  role qa_message_role NOT NULL,
  content TEXT NOT NULL CHECK (char_length(content) BETWEEN 1 AND 20000),
  citations JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX qa_messages_session_idx ON qa_messages (session_id, created_at);

ALTER TABLE qa_sessions ENABLE ROW LEVEL SECURITY; ALTER TABLE qa_sessions FORCE ROW LEVEL SECURITY;
CREATE POLICY qa_sessions_tenant_isolation ON qa_sessions USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid) WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
ALTER TABLE qa_messages ENABLE ROW LEVEL SECURITY; ALTER TABLE qa_messages FORCE ROW LEVEL SECURITY;
CREATE POLICY qa_messages_tenant_isolation ON qa_messages USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid) WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
