ALTER TYPE connector_type ADD VALUE IF NOT EXISTS 'typeform';
ALTER TYPE connector_type ADD VALUE IF NOT EXISTS 'generic_webhook';

ALTER TABLE connectors
  ADD COLUMN IF NOT EXISTS config JSONB NOT NULL DEFAULT '{}'::jsonb;

-- A connector's random webhook_secret is its per-tenant inbound credential.
-- The unique (tenant_id, type) constraint prevents a URL for one tenant being repointed at another tenant's connector.
