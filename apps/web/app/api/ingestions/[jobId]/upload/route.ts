import { NextRequest } from 'next/server';
import { AuthError, requireActiveAuth, requireRole } from '@/lib/server/auth';
import { setTenantContext, withTransaction } from '@/lib/server/db';
import { storeCsv } from '@/lib/server/storage';
import { wakeWorkers } from '@/lib/server/worker-wake';
import { importCsvFeedback } from '@/lib/server/csv-ingestion';

export const runtime = 'nodejs';

export async function PUT(request: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  try {
    const claims = await requireActiveAuth(request);
    requireRole(claims, 'admin', 'editor');
    const { jobId } = await params;
    const job = await withTransaction(async (client) => {
      await setTenantContext(client, claims.tenantId);
      return (await client.query<{ storage_key: string; content_type: string; size_bytes: number; column_mapping: { text?: string } | null }>(
        "SELECT storage_key, content_type, size_bytes, column_mapping FROM ingestion_jobs WHERE id = $1 AND tenant_id = $2 AND status = 'pending_upload'",
        [jobId, claims.tenantId],
      )).rows[0];
    });
    if (!job) return Response.json({ error: 'Pending CSV upload not found.' }, { status: 404 });

    const content = await request.arrayBuffer();
    if (content.byteLength !== Number(job.size_bytes)) return Response.json({ error: 'Uploaded file size does not match the ingestion job.' }, { status: 400 });
    const blob = await storeCsv(job.storage_key, job.content_type, content);
    const reviewColumn = job.column_mapping?.text;
    if (!reviewColumn) return Response.json({ error: 'A main review column is required to import this CSV.' }, { status: 400 });
    const result = await importCsvFeedback({ jobId, tenantId: claims.tenantId, content, reviewColumn });
    wakeWorkers();
    return Response.json({ uploaded: true, status: 'completed', imported: result.imported, skipped: result.skipped, url: blob.url });
  } catch (error) {
    if (error instanceof AuthError) return Response.json({ error: error.message }, { status: error.status });
    console.error('CSV upload failed', error);
    return Response.json({ error: 'Unable to upload CSV.' }, { status: 500 });
  }
}
