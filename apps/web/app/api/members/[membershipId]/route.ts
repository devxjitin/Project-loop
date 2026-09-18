import { NextRequest } from 'next/server';
import { AuthError, requireActiveAuth, requireRole } from '@/lib/server/auth';
import { setTenantContext, withTransaction } from '@/lib/server/db';
export const runtime = 'nodejs';

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ membershipId: string }> }) {
  try {
    const claims = await requireActiveAuth(request); requireRole(claims, 'admin');
    const { membershipId } = await params; const body = await request.json() as { role?: 'admin' | 'editor' | 'viewer'; confirmAdminDemotion?: boolean };
    if (!body.role || !['admin', 'editor', 'viewer'].includes(body.role)) return Response.json({ error: 'Invalid role.' }, { status: 400 });
    const updated = await withTransaction(async (client) => {
      await setTenantContext(client, claims.tenantId);
      const existing = await client.query<{ role: string; user_id: string }>('SELECT role, user_id FROM memberships WHERE id = $1 AND tenant_id = $2', [membershipId, claims.tenantId]);
      if (!existing.rows[0]) return null;
      if (existing.rows[0].user_id === claims.sub && body.role !== 'admin') throw new AuthError(400, 'You cannot remove your own admin role.');
      if (existing.rows[0].role === 'admin' && body.role !== 'admin' && !body.confirmAdminDemotion) throw new AuthError(400, 'Confirm admin demotion explicitly.');
      return (await client.query('UPDATE memberships SET role = $2 WHERE id = $1 RETURNING id, role, status', [membershipId, body.role])).rows[0];
    });
    return updated ? Response.json({ member: updated }) : Response.json({ error: 'Member not found.' }, { status: 404 });
  } catch (error) { if (error instanceof AuthError) return Response.json({ error: error.message }, { status: error.status }); return Response.json({ error: 'Unable to update member.' }, { status: 500 }); }
}
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ membershipId: string }> }) {
  try { const claims = await requireActiveAuth(request); requireRole(claims, 'admin'); const { membershipId } = await params; const result = await withTransaction(async (client) => { await setTenantContext(client, claims.tenantId); return client.query("UPDATE memberships SET status = 'revoked' WHERE id = $1 AND tenant_id = $2 AND user_id <> $3", [membershipId, claims.tenantId, claims.sub]); }); return result.rowCount ? Response.json({ revoked: true }) : Response.json({ error: 'Member not found or cannot revoke self.' }, { status: 404 }); } catch (error) { if (error instanceof AuthError) return Response.json({ error: error.message }, { status: error.status }); return Response.json({ error: 'Unable to revoke member.' }, { status: 500 }); }
}
