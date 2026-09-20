import type { PoolClient } from 'pg';
export function dateRange(search: URLSearchParams) { const to = search.get('to') ?? new Date().toISOString().slice(0, 10); const from = search.get('from') ?? new Date(Date.now() - 29 * 86_400_000).toISOString().slice(0, 10); if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) throw new Error('Use an inclusive YYYY-MM-DD date range.'); return { from, to }; }
/** Optional `jobId` query param: scope analytics to one uploaded file. Null means all files. */
export function datasetId(search: URLSearchParams) { const id = search.get('jobId')?.trim(); if (!id) return null; if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw new Error('Invalid dataset id.'); return id; }
// Analytics read feedback_items live (not the materialized views) so deleting an upload is reflected immediately.
const DAY = "coalesce(f.occurred_at, f.created_at)::date";
const SCOPE = "f.tenant_id = $1 AND $4::uuid IS NULL OR f.tenant_id = $1 AND f.ingestion_job_id = $4::uuid";
const counts = "count(*) FILTER (WHERE f.sentiment = 'positive')::integer AS positive_count, count(*) FILTER (WHERE f.sentiment = 'neutral')::integer AS neutral_count, count(*) FILTER (WHERE f.sentiment = 'negative')::integer AS negative_count, count(*)::integer AS total_count";
// A selected file is analysed in full, so the date range only applies to the all-files view.
const WHERE = `(${SCOPE}) AND ($4::uuid IS NOT NULL OR ${DAY} BETWEEN $2::date AND $3::date)`;
export async function trend(client: PoolClient, tenantId: string, from: string, to: string, jobId: string | null = null) { return (await client.query(`SELECT ${DAY} AS day, ${counts} FROM feedback_items f WHERE ${WHERE} GROUP BY 1 ORDER BY 1`, [tenantId, from, to, jobId])).rows; }
export async function channels(client: PoolClient, tenantId: string, from: string, to: string, jobId: string | null = null) { return (await client.query(`SELECT f.source, count(*)::integer AS total_count FROM feedback_items f WHERE ${WHERE} GROUP BY f.source ORDER BY total_count DESC, f.source`, [tenantId, from, to, jobId])).rows; }
export async function themeCounts(client: PoolClient, tenantId: string, from: string, to: string, limit: number, jobId: string | null = null) { return (await client.query(`SELECT t.id AS theme_id, t.name AS theme_name, ${counts} FROM feedback_items f JOIN feedback_item_themes fit ON fit.feedback_item_id = f.id JOIN themes t ON t.id = fit.theme_id WHERE ${WHERE} GROUP BY t.id, t.name ORDER BY total_count DESC, t.name LIMIT $5`, [tenantId, from, to, jobId, limit])).rows; }

/** Progress of the post-upload pipeline (sentiment, embeddings, theme clustering) for all files or one file. */
export async function pipelineStatus(client: PoolClient, tenantId: string, jobId: string | null) {
  const counts = (await client.query<{ total: number; classified: number; embedded: number }>('SELECT count(*)::integer AS total, count(f.sentiment)::integer AS classified, count(e.feedback_item_id)::integer AS embedded FROM feedback_items f LEFT JOIN feedback_embeddings e ON e.feedback_item_id = f.id WHERE f.tenant_id = $1 AND ($2::uuid IS NULL OR f.ingestion_job_id = $2::uuid)', [tenantId, jobId])).rows[0];
  const stamps = (await client.query<{ clustered_at: string | null; embedded_at: string | null }>('SELECT (SELECT max(last_clustered_at) FROM themes WHERE tenant_id = $1) AS clustered_at, (SELECT max(updated_at) FROM feedback_embeddings WHERE tenant_id = $1) AS embedded_at', [tenantId])).rows[0];
  const themesDone = counts.total < 3 || (counts.embedded === counts.total && stamps.clustered_at !== null && (stamps.embedded_at === null || new Date(stamps.clustered_at) >= new Date(stamps.embedded_at)));
  return { ...counts, themesDone, processing: counts.classified < counts.total || counts.embedded < counts.total || !themesDone };
}
