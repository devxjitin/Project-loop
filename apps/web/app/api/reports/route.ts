import { NextRequest } from 'next/server';
import { AuthError, requireActiveAuth, requireRole } from '@/lib/server/auth';
import { setTenantContext, withTransaction } from '@/lib/server/db';
import { reportSnapshot, summarizeReport } from '@/lib/server/reports';

export const runtime = 'nodejs';
const validDate = (value: string | undefined) => Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));

export async function GET(request: NextRequest) {
  try {
    const claims = await requireActiveAuth(request);
    const reports = await withTransaction(async (client) => {
      await setTenantContext(client, claims.tenantId);
      return (await client.query('SELECT id, period_start, period_end, status, content, snapshot, generated_at, created_at FROM reports WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 20', [claims.tenantId])).rows;
    });
    return Response.json({ reports });
  } catch (error) {
    if (error instanceof AuthError) return Response.json({ error: error.message }, { status: error.status });
    return Response.json({ error: 'Unable to load reports.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const claims = await requireActiveAuth(request);
    requireRole(claims, 'admin');
    const body = await request.json() as { from?: string; to?: string };
    const to = body.to ?? new Date().toISOString().slice(0, 10);
    const from = body.from ?? new Date(Date.now() - 6 * 86_400_000).toISOString().slice(0, 10);
    if (!validDate(from) || !validDate(to) || from > to) return Response.json({ error: 'Use an inclusive YYYY-MM-DD date range.' }, { status: 400 });
    const prepared = await withTransaction(async (client) => {
      await setTenantContext(client, claims.tenantId);
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [claims.tenantId]);
      const recent = await client.query("SELECT id FROM reports WHERE tenant_id = $1 AND created_at > now() - interval '5 minutes' ORDER BY created_at DESC LIMIT 1", [claims.tenantId]);
      if (recent.rowCount) throw new AuthError(429, 'Please wait five minutes before generating another report.');
      const snapshot = await reportSnapshot(client, claims.tenantId, from, to);
      const report = await client.query<{ id: string }>("INSERT INTO reports (tenant_id, period_start, period_end, status, snapshot) VALUES ($1, $2, $3, 'generating', $4::jsonb) RETURNING id", [claims.tenantId, from, to, JSON.stringify(snapshot)]);
      return { id: report.rows[0].id, snapshot };
    });
    try {
      const content = await summarizeReport(from, to, prepared.snapshot);
      await withTransaction(async (client) => { await setTenantContext(client, claims.tenantId); await client.query("UPDATE reports SET status = 'ready', content = $2, generated_at = now() WHERE id = $1", [prepared.id, content]); });
      return Response.json({ report: { id: prepared.id, periodStart: from, periodEnd: to, status: 'ready', content, snapshot: prepared.snapshot } }, { status: 201 });
    } catch (cause) {
      await withTransaction(async (client) => { await setTenantContext(client, claims.tenantId); await client.query("UPDATE reports SET status = 'failed' WHERE id = $1", [prepared.id]); });
      throw cause;
    }
  } catch (error) {
    if (error instanceof AuthError) return Response.json({ error: error.message }, { status: error.status });
    console.error('Report generation failed', error);
    return Response.json({ error: 'Unable to generate report.' }, { status: 502 });
  }
}
