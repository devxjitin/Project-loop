import { createHash, randomBytes } from 'node:crypto';
import { NextRequest } from 'next/server';
import { AuthError, requireActiveAuth, requireRole } from '@/lib/server/auth';
import { setTenantContext, withTransaction } from '@/lib/server/db';
import { sendTransactionalEmail } from '@/lib/server/email';

export const runtime = 'nodejs';
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const htmlEscape = (value: string) => value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);

export async function GET(request: NextRequest) {
  try { const claims = await requireActiveAuth(request); requireRole(claims, 'admin'); const members = await withTransaction(async (client) => { await setTenantContext(client, claims.tenantId); return (await client.query('SELECT m.id, u.email, u.display_name, m.role, m.status, m.created_at FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.tenant_id = $1 ORDER BY m.created_at', [claims.tenantId])).rows; }); return Response.json({ members }); }
  catch (error) { if (error instanceof AuthError) return Response.json({ error: error.message }, { status: error.status }); return Response.json({ error: 'Unable to load members.' }, { status: 500 }); }
}

export async function POST(request: NextRequest) {
  try {
    const claims = await requireActiveAuth(request); requireRole(claims, 'admin');
    const body = await request.json() as { email?: string; role?: 'admin' | 'editor' | 'viewer' };
    const email = body.email?.trim().toLowerCase(); const role = body.role ?? 'viewer';
    if (!email || !/^\S+@\S+\.\S+$/.test(email) || !['admin', 'editor', 'viewer'].includes(role)) return Response.json({ error: 'A valid email and role are required.' }, { status: 400 });
    const token = randomBytes(32).toString('base64url');
    await withTransaction(async (client) => { await setTenantContext(client, claims.tenantId); await client.query(`INSERT INTO invitations (tenant_id, email, role, token_hash, expires_at) VALUES ($1, $2, $3, $4, now() + interval '7 days') ON CONFLICT (tenant_id, email) DO UPDATE SET role = EXCLUDED.role, token_hash = EXCLUDED.token_hash, expires_at = EXCLUDED.expires_at, accepted_at = NULL, revoked_at = NULL`, [claims.tenantId, email, role, digest(token)]); });
    const inviteUrl = new URL(`/invite?token=${encodeURIComponent(token)}`, process.env.APP_URL ?? request.url).toString();
    try {
      await sendTransactionalEmail({ to: email, subject: 'You are invited to Project LOOP', html: `<p>You have been invited to join a Project LOOP workspace as a <strong>${htmlEscape(role)}</strong>.</p><p><a href="${htmlEscape(inviteUrl)}">Accept invitation</a></p><p>This link expires in 7 days. If you already have a LOOP account, enter that account's password to accept.</p>` });
    } catch (cause) {
      console.error('Invitation email delivery failed', cause);
      return Response.json({ error: 'Invitation was created but email delivery failed. Check transactional email configuration before retrying.' }, { status: 503 });
    }
    return Response.json({ invited: true, delivery: 'email', expiresInDays: 7 }, { status: 201 });
  } catch (error) { if (error instanceof AuthError) return Response.json({ error: error.message }, { status: error.status }); return Response.json({ error: 'Unable to create invitation.' }, { status: 500 }); }
}
