import { NextRequest } from 'next/server';
import { AuthError, requireActiveAuth } from '@/lib/server/auth';
import { setTenantContext, withTransaction } from '@/lib/server/db';
import { dateRange, datasetId, themeCounts } from '@/lib/server/analytics';

export const runtime = 'nodejs';
export async function GET(request: NextRequest) {
  try {
    const claims = await requireActiveAuth(request);
    const { from, to } = dateRange(request.nextUrl.searchParams);
    const jobId = datasetId(request.nextUrl.searchParams);
    const limit = Math.min(Math.max(Number(request.nextUrl.searchParams.get('limit') ?? 10) || 10, 1), 50);
    const data = await withTransaction(async (client) => { await setTenantContext(client, claims.tenantId); return themeCounts(client, claims.tenantId, from, to, limit, jobId); });
    return Response.json({ from, to, jobId, data });
  } catch (error) { if (error instanceof AuthError) return Response.json({ error: error.message }, { status: error.status }); return Response.json({ error: error instanceof Error ? error.message : 'Unable to load themes.' }, { status: 400 }); }
}
