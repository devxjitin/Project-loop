import { NextRequest } from 'next/server';
import { AuthError, requireActiveAuth, requireRole } from '@/lib/server/auth';
import { setTenantContext, withTransaction } from '@/lib/server/db';
import { deleteStoredCsv } from '@/lib/server/storage';

export const runtime = 'nodejs';

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  try {
    const claims = await requireActiveAuth(request);
    requireRole(claims, 'admin');
    const { jobId } = await params;
    const job = await withTransaction(async (client) => {
      await setTenantContext(client, claims.tenantId);
      const result = await client.query<{ storage_key: string }>('DELETE FROM ingestion_jobs WHERE id = $1 AND tenant_id = $2 RETURNING storage_key', [jobId, claims.tenantId]);
      return result.rows[0];
    });
    if (!job) return Response.json({ error: 'Dataset upload was not found.' }, { status: 404 });
    await deleteStoredCsv(job.storage_key);
    return Response.json({ deleted: true });
  } catch (error) {
    if (error instanceof AuthError) return Response.json({ error: error.message }, { status: error.status });
    console.error('CSV history deletion failed', error);
    return Response.json({ error: 'Unable to delete dataset upload.' }, { status: 500 });
  }
}
