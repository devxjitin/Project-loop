import { NextRequest } from 'next/server';
import { AuthError, requireActiveAuth } from '@/lib/server/auth';
import { setTenantContext, withTransaction } from '@/lib/server/db';

export const runtime = 'nodejs';
export async function GET(request: NextRequest) {
  try {
    const claims = await requireActiveAuth(request);
    const themes = await withTransaction(async (client) => { await setTenantContext(client, claims.tenantId); return (await client.query<{ id: string; name: string }>('SELECT id, name FROM themes WHERE tenant_id = $1 ORDER BY name', [claims.tenantId])).rows; });
    return Response.json({ themes });
  } catch (error) { if (error instanceof AuthError) return Response.json({ error: error.message }, { status: error.status }); return Response.json({ error: 'Unable to load themes.' }, { status: 500 }); }
}
