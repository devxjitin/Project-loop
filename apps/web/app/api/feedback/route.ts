import { NextRequest } from 'next/server';
import { AuthError, requireActiveAuth } from '@/lib/server/auth';
import { setTenantContext, withTransaction } from '@/lib/server/db';

export const runtime = 'nodejs';
type Cursor = { createdAt: string; id: string };
function decodeCursor(value: string | null): Cursor | null { try { const parsed = JSON.parse(Buffer.from(value ?? '', 'base64url').toString()) as Cursor; return parsed.createdAt && parsed.id ? parsed : null; } catch { return null; } }
function encodeCursor(cursor: Cursor) { return Buffer.from(JSON.stringify(cursor)).toString('base64url'); }
const sentiments = new Set(['positive', 'neutral', 'negative']);

export async function GET(request: NextRequest) {
  try {
    const claims = await requireActiveAuth(request);
    const query = request.nextUrl.searchParams;
    const limit = Math.min(Math.max(Number(query.get('limit') ?? 50) || 50, 1), 100);
    const cursor = decodeCursor(query.get('cursor'));
    const jobId = query.get('jobId')?.trim() || null;
    const sentiment = query.get('sentiment')?.trim() || null;
    const themeId = query.get('themeId')?.trim() || null;
    const keyword = query.get('q')?.trim() || null;
    const from = query.get('from')?.trim() || null;
    const to = query.get('to')?.trim() || null;
    if (jobId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(jobId)) return Response.json({ error: 'Invalid file filter.' }, { status: 400 });
    if (sentiment && !sentiments.has(sentiment)) return Response.json({ error: 'Invalid sentiment filter.' }, { status: 400 });
    const items = await withTransaction(async (client) => {
      await setTenantContext(client, claims.tenantId);
      const values: unknown[] = [claims.tenantId]; const where = ['f.tenant_id = $1'];
      const add = (condition: string, value: unknown) => { values.push(value); where.push(condition.replace('?', `$${values.length}`)); };
      if (jobId) add('f.ingestion_job_id = ?::uuid', jobId); if (sentiment) add('f.sentiment = ?', sentiment); if (from) add('f.created_at >= ?::timestamptz', from); if (to) add("f.created_at < (?::timestamptz + interval '1 day')", to);
      if (keyword) add("f.search_vector @@ websearch_to_tsquery('english', ?)", keyword);
      if (themeId) add('EXISTS (SELECT 1 FROM feedback_item_themes fit WHERE fit.feedback_item_id = f.id AND fit.tenant_id = f.tenant_id AND fit.theme_id = ?::uuid)', themeId);
      if (cursor) { values.push(cursor.createdAt, cursor.id); where.push(`(f.created_at, f.id) < ($${values.length - 1}::timestamptz, $${values.length}::uuid)`); }
      values.push(limit + 1);
      return (await client.query<{ id: string; source: string; raw_text: string; author: string | null; source_url: string | null; occurred_at: string | null; sentiment: 'positive' | 'neutral' | 'negative' | null; created_at: string; themes: Array<{ id: string; name: string }> }>(`SELECT f.id, COALESCE(j.original_filename, f.source) AS source, f.raw_text, f.author, f.source_url, f.occurred_at, f.sentiment, f.created_at, COALESCE((SELECT jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name) ORDER BY t.name) FROM feedback_item_themes fit JOIN themes t ON t.id = fit.theme_id WHERE fit.feedback_item_id = f.id AND fit.tenant_id = f.tenant_id), '[]'::jsonb) AS themes FROM feedback_items f LEFT JOIN ingestion_jobs j ON j.id = f.ingestion_job_id WHERE ${where.join(' AND ')} ORDER BY f.created_at DESC, f.id DESC LIMIT $${values.length}`, values)).rows;
    });
    const hasMore = items.length > limit; const page = items.slice(0, limit); const last = page.at(-1);
    return Response.json({ items: page, nextCursor: hasMore && last ? encodeCursor({ createdAt: last.created_at, id: last.id }) : null });
  } catch (error) { if (error instanceof AuthError) return Response.json({ error: error.message }, { status: error.status }); console.error('List feedback failed', error); return Response.json({ error: 'Unable to load feedback.' }, { status: 500 }); }
}
