import { NextRequest } from 'next/server';
import { AuthError, requireActiveAuth } from '@/lib/server/auth';
import { setTenantContext, withTransaction } from '@/lib/server/db';
import { dateRange } from '@/lib/server/analytics';

export const runtime = 'nodejs';
export async function GET(request: NextRequest) {
  try {
    const claims = await requireActiveAuth(request);
    const { from, to } = dateRange(request.nextUrl.searchParams);
    const limit = Math.min(Math.max(Number(request.nextUrl.searchParams.get('limit') ?? 10) || 10, 1), 50);
    const data = await withTransaction(async (client) => { await setTenantContext(client, claims.tenantId); return (await client.query('SELECT theme_id, theme_name, sum(positive_count)::integer AS positive_count, sum(neutral_count)::integer AS neutral_count, sum(negative_count)::integer AS negative_count, sum(total_count)::integer AS total_count FROM tenant_analytics_theme_counts WHERE tenant_id = $1 AND day BETWEEN $2::date AND $3::date GROUP BY theme_id, theme_name ORDER BY total_count DESC, theme_name LIMIT $4', [claims.tenantId, from, to, limit])).rows; });
    return Response.json({ from, to, data });
  } catch (error) { if (error instanceof AuthError) return Response.json({ error: error.message }, { status: error.status }); return Response.json({ error: error instanceof Error ? error.message : 'Unable to load themes.' }, { status: 400 }); }
}
