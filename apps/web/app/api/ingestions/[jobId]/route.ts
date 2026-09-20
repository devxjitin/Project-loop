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
      // Deleting an upload removes the feedback it imported (embeddings and theme links cascade), then any themes left empty.
      await client.query('DELETE FROM feedback_items WHERE ingestion_job_id = $1 AND tenant_id = $2', [jobId, claims.tenantId]);
      await client.query('DELETE FROM themes t WHERE t.tenant_id = $1 AND NOT EXISTS (SELECT 1 FROM feedback_item_themes fit WHERE fit.theme_id = t.id)', [claims.tenantId]);
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
