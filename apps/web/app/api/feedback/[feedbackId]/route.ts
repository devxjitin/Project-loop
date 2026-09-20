import { NextRequest } from 'next/server';
import { AuthError, requireActiveAuth } from '@/lib/server/auth';
import { setTenantContext, withTransaction } from '@/lib/server/db';

export const runtime = 'nodejs';
export async function GET(request: NextRequest, { params }: { params: Promise<{ feedbackId: string }> }) {
  try {
    const claims = await requireActiveAuth(request);
    const { feedbackId } = await params;
    const item = await withTransaction(async (client) => {
      await setTenantContext(client, claims.tenantId);
      return (await client.query(`SELECT f.id, COALESCE(j.original_filename, f.source) AS source, f.raw_text, f.author, f.source_url, f.occurred_at, f.sentiment, f.created_at, COALESCE((SELECT jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name) ORDER BY t.name) FROM feedback_item_themes fit JOIN themes t ON t.id = fit.theme_id WHERE fit.feedback_item_id = f.id AND fit.tenant_id = f.tenant_id), '[]'::jsonb) AS themes FROM feedback_items f LEFT JOIN ingestion_jobs j ON j.id = f.ingestion_job_id WHERE f.id = $1 AND f.tenant_id = $2`, [feedbackId, claims.tenantId])).rows[0];
    });
    if (!item) return Response.json({ error: 'Feedback item not found.' }, { status: 404 });
    return Response.json({ item });
  } catch (error) { if (error instanceof AuthError) return Response.json({ error: error.message }, { status: error.status }); return Response.json({ error: 'Unable to load feedback item.' }, { status: 500 }); }
}
