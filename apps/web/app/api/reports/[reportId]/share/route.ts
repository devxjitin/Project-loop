import { createHash, randomBytes } from 'node:crypto';
import { NextRequest } from 'next/server';
import { AuthError, requireActiveAuth, requireRole } from '@/lib/server/auth';
import { setTenantContext, withTransaction } from '@/lib/server/db';

export const runtime = 'nodejs';
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const maxShareLifetimeDays = 90;
function expiry(value: unknown) {
  if (!value) return new Date(Date.now() + 30 * 86_400_000);
  if (typeof value !== 'string') return null;
  const date = new Date(value);
  if (Number.isNaN(date.valueOf()) || date <= new Date() || date > new Date(Date.now() + maxShareLifetimeDays * 86_400_000)) return null;
  return date;
}
async function adminContext(request: NextRequest) { const claims = await requireActiveAuth(request); requireRole(claims, 'admin'); return claims; }

export async function GET(request: NextRequest, { params }: { params: Promise<{ reportId: string }> }) {
  try {
    const claims = await adminContext(request); const { reportId } = await params;
    const links = await withTransaction(async (client) => { await setTenantContext(client, claims.tenantId); return (await client.query('SELECT id, expires_at, created_at FROM share_tokens WHERE report_id = $1 AND tenant_id = $2 AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > now()) ORDER BY created_at DESC', [reportId, claims.tenantId])).rows; });
    return Response.json({ links });
  } catch (error) { if (error instanceof AuthError) return Response.json({ error: error.message }, { status: error.status }); return Response.json({ error: 'Unable to load share links.' }, { status: 500 }); }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ reportId: string }> }) {
  try {
    const claims = await adminContext(request); const { reportId } = await params;
    const expiresAt = expiry((await request.json().catch(() => ({})) as { expiresAt?: unknown }).expiresAt);
    if (!expiresAt) return Response.json({ error: `Choose an expiry within the next ${maxShareLifetimeDays} days.` }, { status: 400 });
    const token = randomBytes(32).toString('base64url');
    const shared = await withTransaction(async (client) => { await setTenantContext(client, claims.tenantId); const report = await client.query("SELECT id FROM reports WHERE id = $1 AND tenant_id = $2 AND status = 'ready'", [reportId, claims.tenantId]); if (!report.rowCount) return false; await client.query('INSERT INTO share_tokens (report_id, tenant_id, token_hash, expires_at) VALUES ($1, $2, $3, $4)', [reportId, claims.tenantId, digest(token), expiresAt]); return true; });
    if (!shared) return Response.json({ error: 'Ready report not found.' }, { status: 404 });
    return Response.json({ url: new URL(`/reports/shared/${token}`, request.url).toString(), expiresAt: expiresAt.toISOString() }, { status: 201 });
  } catch (error) { if (error instanceof AuthError) return Response.json({ error: error.message }, { status: error.status }); return Response.json({ error: 'Unable to create a share link.' }, { status: 500 }); }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ reportId: string }> }) {
  try {
    const claims = await adminContext(request); const { reportId } = await params; const shareTokenId = request.nextUrl.searchParams.get('shareTokenId');
    if (!shareTokenId) return Response.json({ error: 'shareTokenId is required.' }, { status: 400 });
    const result = await withTransaction(async (client) => { await setTenantContext(client, claims.tenantId); return client.query('UPDATE share_tokens SET revoked_at = now() WHERE id = $1 AND report_id = $2 AND tenant_id = $3 AND revoked_at IS NULL', [shareTokenId, reportId, claims.tenantId]); });
    return result.rowCount ? Response.json({ revoked: true }) : Response.json({ error: 'Active share link not found.' }, { status: 404 });
  } catch (error) { if (error instanceof AuthError) return Response.json({ error: error.message }, { status: error.status }); return Response.json({ error: 'Unable to revoke share link.' }, { status: 500 }); }
}
