import { createHash } from 'node:crypto';
import { NextRequest } from 'next/server';
import { hashPassword, issueTokens, MIN_PASSWORD_LENGTH, verifyPassword } from '@/lib/server/auth';
import { db, setTenantContext, withTransaction } from '@/lib/server/db';

const digest = (value: string) => createHash('sha256').update(value).digest('hex');
export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const body = await request.json() as { token?: string; password?: string; displayName?: string };
  const token = body.token;
  const password = body.password;
  if (!token || !password || password.length < MIN_PASSWORD_LENGTH) return Response.json({ error: `A valid invitation token and password of at least ${MIN_PASSWORD_LENGTH} characters are required.` }, { status: 400 });
  const invite = await db.query<{ tenant_id: string; email: string; role: 'admin' | 'editor' | 'viewer' }>("SELECT tenant_id, email, role FROM invitations WHERE token_hash = $1 AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > now()", [digest(token)]);
  const record = invite.rows[0];
  if (!record) return Response.json({ error: 'Invitation is invalid or expired.' }, { status: 400 });
  let userId: string;
  try {
    userId = await withTransaction(async (client) => {
      await setTenantContext(client, record.tenant_id);
      const found = await client.query<{ id: string; password_hash: string }>('SELECT * FROM authentication_user_by_email($1)', [record.email]);
      const existing = found.rows[0];
      if (existing && !(await verifyPassword(password, existing.password_hash))) throw new InviteAuthenticationError();
      const id = existing?.id ?? (await client.query<{ id: string }>('INSERT INTO users (email, password_hash, display_name) VALUES ($1, $2, $3) RETURNING id', [record.email, await hashPassword(password), body.displayName?.trim() || null])).rows[0].id;
      await client.query("INSERT INTO memberships (tenant_id, user_id, role, status) VALUES ($1, $2, $3, 'active') ON CONFLICT (tenant_id, user_id) DO UPDATE SET role = EXCLUDED.role, status = 'active'", [record.tenant_id, id, record.role]);
      await client.query('UPDATE invitations SET accepted_at = now() WHERE token_hash = $1', [digest(token)]);
      return id;
    });
  } catch (error) {
    if (error instanceof InviteAuthenticationError) return Response.json({ error: 'Sign in with the existing account password to accept this invitation.' }, { status: 401 });
    throw error;
  }
  return Response.json(issueTokens({ sub: userId, tenantId: record.tenant_id, role: record.role }), { status: 201 });
}

class InviteAuthenticationError extends Error {}
