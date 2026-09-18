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
      const tenant = await client.query<{ id: string; name: string }>('INSERT INTO tenants (name) VALUES ($1) RETURNING id, name', [organizationName]);
      const created = await client.query<{ id: string; email: string }>('INSERT INTO users (email, password_hash, display_name) VALUES ($1, $2, $3) RETURNING id, email', [email, await hashPassword(password), body.displayName?.trim() ?? null]);
      await setTenantContext(client, tenant.rows[0].id);
      await client.query('INSERT INTO memberships (tenant_id, user_id, role) VALUES ($1, $2, $3)', [tenant.rows[0].id, created.rows[0].id, 'admin']);
      return { ...created.rows[0], tenantId: tenant.rows[0].id, tenantName: tenant.rows[0].name, role: 'admin' as const };
    });
    return Response.json({ user, ...issueTokens({ sub: user.id, tenantId: user.tenantId, role: user.role }) }, { status: 201 });
  } catch (error) {
    if ((error as { code?: string }).code === '23505') return Response.json({ error: 'An account with that email already exists.' }, { status: 409 });
    console.error('Signup failed', error);
    return Response.json({ error: 'Unable to create account.' }, { status: 500 });
  }
}
