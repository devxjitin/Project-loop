import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';
import { hashPassword, issueTokens, MIN_PASSWORD_LENGTH } from '@/lib/server/auth';
import { setTenantContext, withTransaction } from '@/lib/server/db';

export const runtime = 'nodejs';
type SignupInput = { email?: string; password?: string; organizationName?: string; displayName?: string };

export async function POST(request: NextRequest) {
  const body = await request.json() as SignupInput;
  const email = body.email?.trim().toLowerCase();
  const organizationName = body.organizationName?.trim();
  const password = body.password;
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) return Response.json({ error: 'A valid email is required.' }, { status: 400 });
  if (!password || password.length < MIN_PASSWORD_LENGTH) return Response.json({ error: `Password must contain at least ${MIN_PASSWORD_LENGTH} characters.` }, { status: 400 });
  if (!organizationName) return Response.json({ error: 'Organization name is required.' }, { status: 400 });
  try {
    const user = await withTransaction(async (client) => {
      // Ids are generated here because INSERT ... RETURNING is checked against the SELECT policies, which
      // require a membership row that does not exist until sign-up finishes.
      const tenantId = randomUUID();
      const userId = randomUUID();
      await setTenantContext(client, tenantId);
      await client.query('INSERT INTO tenants (id, name) VALUES ($1, $2)', [tenantId, organizationName]);
      await client.query('INSERT INTO users (id, email, password_hash, display_name) VALUES ($1, $2, $3, $4)', [userId, email, await hashPassword(password), body.displayName?.trim() ?? null]);
      await client.query('INSERT INTO memberships (tenant_id, user_id, role) VALUES ($1, $2, $3)', [tenantId, userId, 'admin']);
      return { id: userId, email, tenantId, tenantName: organizationName, role: 'admin' as const };
    });
    return Response.json({ user, ...issueTokens({ sub: user.id, tenantId: user.tenantId, role: user.role }) }, { status: 201 });
  } catch (error) {
    if ((error as { code?: string }).code === '23505') return Response.json({ error: 'An account with that email already exists.' }, { status: 409 });
    console.error('Signup failed', error);
    return Response.json({ error: 'Unable to create account.' }, { status: 500 });
  }
}
