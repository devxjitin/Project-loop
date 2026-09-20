import { NextRequest } from 'next/server';
import { AuthError, requireActiveAuth } from '@/lib/server/auth';
import { setTenantContext, withTransaction } from '@/lib/server/db';
import { datasetId, pipelineStatus } from '@/lib/server/analytics';

export const runtime = 'nodejs';
export async function GET(request: NextRequest) {
  try {
    const claims = await requireActiveAuth(request);
    const jobId = datasetId(request.nextUrl.searchParams);
    const data = await withTransaction(async (client) => { await setTenantContext(client, claims.tenantId); return pipelineStatus(client, claims.tenantId, jobId); });
    return Response.json({ jobId, ...data });
  } catch (error) { if (error instanceof AuthError) return Response.json({ error: error.message }, { status: error.status }); return Response.json({ error: error instanceof Error ? error.message : 'Unable to load analysis status.' }, { status: 400 }); }
}
