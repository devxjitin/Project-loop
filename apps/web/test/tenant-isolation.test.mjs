import assert from 'node:assert/strict';
import test from 'node:test';
import { Client } from 'pg';

const databaseUrl = process.env.DATABASE_URL ?? 'postgresql://loop:loop_local_password@localhost:5432/loop';
const context = (client, tenantId, userId) => Promise.all([
  client.query("SELECT set_config('app.current_tenant_id', $1, true)", [tenantId]),
  client.query("SELECT set_config('app.current_user_id', $1, true)", [userId]),
]);
const rows = async (client, sql, values) => (await client.query(sql, values)).rows;

test('live database prevents cross-tenant access and protects public reports', async () => {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query(`DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'loop_rls_test_app') THEN CREATE ROLE loop_rls_test_app NOLOGIN; END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_auth_members m JOIN pg_roles r ON r.oid = m.roleid WHERE r.rolname = 'loop_rls_test_app' AND m.member = (SELECT oid FROM pg_roles WHERE rolname = current_user)) THEN EXECUTE format('GRANT loop_rls_test_app TO %I', current_user); END IF;
    END $$`);
    await client.query('GRANT USAGE ON SCHEMA public TO loop_rls_test_app');
    await client.query('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO loop_rls_test_app');
    await client.query('GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO loop_rls_test_app');
    await client.query('BEGIN');
    const [tenantA] = await rows(client, "INSERT INTO tenants (name) VALUES ('RLS Test A') RETURNING id");
    const [tenantB] = await rows(client, "INSERT INTO tenants (name) VALUES ('RLS Test B') RETURNING id");
    const [userA] = await rows(client, "INSERT INTO users (email, password_hash) VALUES ('rls-a-' || gen_random_uuid() || '@example.test', 'hash') RETURNING id");
    const [userB] = await rows(client, "INSERT INTO users (email, password_hash) VALUES ('rls-b-' || gen_random_uuid() || '@example.test', 'hash') RETURNING id");
    await client.query('SET LOCAL ROLE loop_rls_test_app');
    await context(client, tenantA.id, userA.id);
    await client.query("INSERT INTO memberships (tenant_id, user_id, role, status) VALUES ($1, $2, 'admin', 'active')", [tenantA.id, userA.id]);
    await context(client, tenantB.id, userB.id);
    await client.query("INSERT INTO memberships (tenant_id, user_id, role, status) VALUES ($1, $2, 'admin', 'active')", [tenantB.id, userB.id]);
    await client.query("INSERT INTO ingestion_jobs (tenant_id, storage_key, original_filename, size_bytes) VALUES ($1, 'rls/' || gen_random_uuid(), 'test.csv', 1)", [tenantB.id]);
    const [feedbackB] = await rows(client, "INSERT INTO feedback_items (tenant_id, source, raw_text) VALUES ($1, 'rls-test', 'Tenant B feedback') RETURNING id", [tenantB.id]);
    const [connectorB] = await rows(client, "INSERT INTO connectors (tenant_id, type) VALUES ($1, 'zendesk') RETURNING id", [tenantB.id]);
    const [sessionB] = await rows(client, 'INSERT INTO qa_sessions (tenant_id, user_id) VALUES ($1, $2) RETURNING id', [tenantB.id, userB.id]);
    await client.query("INSERT INTO qa_messages (tenant_id, session_id, role, content) VALUES ($1, $2, 'user', 'Tenant B question')", [tenantB.id, sessionB.id]);
    await client.query("INSERT INTO report_schedules (tenant_id, cadence) VALUES ($1, 'weekly')", [tenantB.id]);
    const [reportB] = await rows(client, "INSERT INTO reports (tenant_id, period_start, period_end, status, content) VALUES ($1, current_date, current_date, 'ready', 'Private report') RETURNING id", [tenantB.id]);
    await client.query("INSERT INTO share_tokens (tenant_id, report_id, token_hash, expires_at) VALUES ($1, $2, 'rls-valid-token', now() + interval '1 hour')", [tenantB.id, reportB.id]);

    await context(client, tenantA.id, userA.id);
    for (const [name, query, values] of [
      ['memberships', 'SELECT id FROM memberships WHERE tenant_id = $1', [tenantB.id]],
      ['ingestion jobs', 'SELECT id FROM ingestion_jobs WHERE tenant_id = $1', [tenantB.id]],
      ['feedback', 'SELECT id FROM feedback_items WHERE id = $1', [feedbackB.id]],
      ['connectors', 'SELECT id FROM connectors WHERE id = $1', [connectorB.id]],
      ['Q&A sessions', 'SELECT id FROM qa_sessions WHERE id = $1', [sessionB.id]],
      ['Q&A messages', 'SELECT id FROM qa_messages WHERE session_id = $1', [sessionB.id]],
      ['report schedules', 'SELECT tenant_id FROM report_schedules WHERE tenant_id = $1', [tenantB.id]],
      ['reports', 'SELECT id FROM reports WHERE id = $1', [reportB.id]],
    ]) assert.equal((await rows(client, query, values)).length, 0, `${name} must not cross tenant boundary`);

    await client.query("SELECT set_config('app.current_tenant_id', '', true)");
    assert.equal((await rows(client, 'SELECT * FROM tenant_analytics_sentiment_daily')).length, 0, 'analytics view must return no rows without tenant context');
    assert.equal((await rows(client, "SELECT * FROM public_report_by_token('invalid-token')")).length, 0, 'invalid public-report token must return no rows');
    assert.equal((await rows(client, "SELECT * FROM public_report_by_token('rls-valid-token')")).length, 1, 'valid public-report token must return its report');
    await context(client, tenantB.id, userB.id);
    await client.query("UPDATE share_tokens SET revoked_at = now() WHERE token_hash = 'rls-valid-token'");
    assert.equal((await rows(client, "SELECT * FROM public_report_by_token('rls-valid-token')")).length, 0, 'revoked public-report token must return no rows');
  } finally {
    await client.query('ROLLBACK').catch(() => undefined);
    await client.end();
  }
});
