import { NextRequest } from 'next/server';
import { issueTokens, verifyPassword } from '@/lib/server/auth';
import { db, setUserContext } from '@/lib/server/db';
import { checkLoginRateLimit, clearLoginRateLimit } from '@/lib/server/login-rate-limit';

export const runtime = 'nodejs';
type LoginInput = { email?: string; password?: string };

export async function POST(request: NextRequest) {
  const { email, password } = await request.json() as LoginInput;
  if (!email || !password) return Response.json({ error: 'Email and password are required.' }, { status: 400 });
  const normalizedEmail = email.trim().toLowerCase(); const forwarded = request.headers.get('x-forwarded-for'); const ip = forwarded?.split(',')[0].trim() || request.headers.get('x-real-ip') || 'unknown';
  const limit = await checkLoginRateLimit(normalizedEmail, ip);
  if (!limit.allowed) return Response.json({ error: 'Too many sign-in attempts. Please try again later.' }, { status: 429, headers: { 'retry-after': String(limit.retryAfter) } });
  const client = await db.connect();
  try {
    const users = await client.query<{ id: string; password_hash: string }>('SELECT * FROM authentication_user_by_email($1)', [normalizedEmail]);
    const account = users.rows[0];
    if (!account || !(await verifyPassword(password, account.password_hash))) return Response.json({ error: 'Invalid email or password.' }, { status: 401 });
    await client.query('BEGIN');
    await setUserContext(client, account.id);
    const memberships = await client.query<{ tenant_id: string; role: 'admin' | 'editor' | 'viewer' }>("SELECT tenant_id, role FROM memberships WHERE user_id = $1 AND status = 'active' ORDER BY created_at LIMIT 1", [account.id]);
    await client.query('COMMIT');
    const identity = memberships.rows[0] && { id: account.id, ...memberships.rows[0] };
    if (!identity) return Response.json({ error: 'Invalid email or password.' }, { status: 401 });
    await clearLoginRateLimit(normalizedEmail, ip);
    return Response.json(issueTokens({ sub: identity.id, tenantId: identity.tenant_id, role: identity.role }));
  } finally { client.release(); }
}
