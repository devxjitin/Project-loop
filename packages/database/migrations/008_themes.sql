CREATE TABLE themes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  normalized_name TEXT NOT NULL,
  centroid vector(1536) NOT NULL,
  last_clustered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, normalized_name)
);

CREATE TABLE feedback_item_themes (
  feedback_item_id UUID NOT NULL REFERENCES feedback_items(id) ON DELETE CASCADE,
  theme_id UUID NOT NULL REFERENCES themes(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (feedback_item_id, theme_id)
);

CREATE INDEX themes_tenant_idx ON themes (tenant_id, last_clustered_at DESC);
CREATE INDEX feedback_item_themes_tenant_theme_idx ON feedback_item_themes (tenant_id, theme_id);

ALTER TABLE themes ENABLE ROW LEVEL SECURITY;
ALTER TABLE themes FORCE ROW LEVEL SECURITY;
ALTER TABLE feedback_item_themes ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback_item_themes FORCE ROW LEVEL SECURITY;
CREATE POLICY themes_tenant_isolation ON themes USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid) WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
CREATE POLICY feedback_item_themes_tenant_isolation ON feedback_item_themes USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid) WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
