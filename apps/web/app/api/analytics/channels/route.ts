import { NextRequest } from 'next/server';
import { AuthError, requireActiveAuth } from '@/lib/server/auth';
import { setTenantContext, withTransaction } from '@/lib/server/db';
import { dateRange } from '@/lib/server/analytics';

export const runtime = 'nodejs';
export async function GET(request: NextRequest) {
  try {
    const claims = await requireActiveAuth(request);
    const { from, to } = dateRange(request.nextUrl.searchParams);
    const data = await withTransaction(async (client) => { await setTenantContext(client, claims.tenantId); return (await client.query('SELECT source, sum(total_count)::integer AS total_count FROM tenant_analytics_channel_counts WHERE tenant_id = $1 AND day BETWEEN $2::date AND $3::date GROUP BY source ORDER BY total_count DESC, source', [claims.tenantId, from, to])).rows; });
    return Response.json({ from, to, data });
  } catch (error) { if (error instanceof AuthError) return Response.json({ error: error.message }, { status: error.status }); return Response.json({ error: error instanceof Error ? error.message : 'Unable to load channels.' }, { status: 400 }); }
}
