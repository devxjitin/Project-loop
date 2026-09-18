import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';
import { AuthError, requireActiveAuth, requireRole } from '@/lib/server/auth';
import { setTenantContext, withTransaction } from '@/lib/server/db';

export const runtime = 'nodejs';
type StartIngestionInput = { filename?: string; contentType?: string; sizeBytes?: number; columnMapping?: Record<string, string> };

export async function GET(request: NextRequest) {
  try {
    const claims = await requireActiveAuth(request);
    const jobs = await withTransaction(async (client) => {
      await setTenantContext(client, claims.tenantId);
      return (await client.query('SELECT id, original_filename, status, size_bytes, row_count, error_count, created_at, completed_at FROM ingestion_jobs WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 20', [claims.tenantId])).rows;
    });
    return Response.json({ jobs });
  } catch (error) {
    if (error instanceof AuthError) return Response.json({ error: error.message }, { status: error.status });
    return Response.json({ error: 'Unable to load CSV imports.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const claims = await requireActiveAuth(request);
    requireRole(claims, 'admin');
    const body = await request.json() as StartIngestionInput;
    const filename = body.filename?.trim();
    const contentType = body.contentType || 'text/csv';
    if (!filename || !filename.toLowerCase().endsWith('.csv')) return Response.json({ error: 'A CSV filename is required.' }, { status: 400 });
    if (!Number.isInteger(body.sizeBytes) || body.sizeBytes! < 1 || body.sizeBytes! > 52_428_800) return Response.json({ error: 'CSV must be between 1 byte and 50 MB.' }, { status: 400 });
    const key = `tenants/${claims.tenantId}/ingestions/${randomUUID()}/${filename.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const job = await withTransaction(async (client) => {
      await setTenantContext(client, claims.tenantId);
      const result = await client.query<{ id: string; status: string; created_at: string }>(
        'INSERT INTO ingestion_jobs (tenant_id, storage_key, original_filename, content_type, size_bytes, column_mapping) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, status, created_at',
        [claims.tenantId, key, filename, contentType, body.sizeBytes, body.columnMapping ?? null],
      );
      return result.rows[0];
    });
    return Response.json({ job, uploadUrl: `/api/ingestions/${job.id}/upload`, uploadMethod: 'PUT', expiresInSeconds: 900 }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) return Response.json({ error: error.message }, { status: error.status });
    console.error('Create ingestion failed', error);
    return Response.json({ error: 'Unable to create ingestion job.' }, { status: 500 });
  }
}
