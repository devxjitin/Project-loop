import { NextRequest } from 'next/server';
import { AuthError, issueTokens, requireRefreshToken, type Role } from '@/lib/server/auth';
import { setTenantContext, setUserContext, withTransaction } from '@/lib/server/db';

export const runtime = 'nodejs';
export async function POST(request: NextRequest) {
  try {
    const { refreshToken } = await request.json() as { refreshToken?: string };
    if (!refreshToken) throw new AuthError(401, 'Missing refresh token.');
    const claims = requireRefreshToken(refreshToken);
    const membership = await withTransaction(async (client) => { await setUserContext(client, claims.sub); await setTenantContext(client, claims.tenantId); return (await client.query<{ role: Role }>("SELECT role FROM memberships WHERE tenant_id = $1 AND user_id = $2 AND status = 'active'", [claims.tenantId, claims.sub])).rows[0]; });
    if (!membership) throw new AuthError(401, 'Your workspace access is no longer active.');
    return Response.json(issueTokens({ sub: claims.sub, tenantId: claims.tenantId, role: membership.role }));
  } catch (error) { if (error instanceof AuthError) return Response.json({ error: error.message }, { status: error.status }); return Response.json({ error: 'Unable to refresh your session.' }, { status: 500 }); }
}
