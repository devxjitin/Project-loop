import type { PoolClient } from 'pg';

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
/** Analytics are file-based, so a date range is optional; without one every row is included. */
export function dateRange(search: URLSearchParams): { from: string | null; to: string | null } {
  const from = search.get('from')?.trim() || null;
  const to = search.get('to')?.trim() || null;
  if ((from && !ISO_DAY.test(from)) || (to && !ISO_DAY.test(to)) || (from && to && from > to)) throw new Error('Use an inclusive YYYY-MM-DD date range.');
  return { from, to };
}
/** Optional `jobId` query param: scope analytics to one uploaded file. Null means all files. */
export function datasetId(search: URLSearchParams) { const id = search.get('jobId')?.trim(); if (!id) return null; if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw new Error('Invalid dataset id.'); return id; }

// Analytics read feedback_items live (not the materialized views) so deleting an upload is reflected immediately.
// Shared parameters: $1 tenant, $2 from (nullable), $3 to (nullable), $4 file id (nullable).
const DAY = "coalesce(f.occurred_at, f.created_at)::date";
const WHERE = `f.tenant_id = $1 AND ($4::uuid IS NULL OR f.ingestion_job_id = $4::uuid) AND ($2::date IS NULL OR ${DAY} >= $2::date) AND ($3::date IS NULL OR ${DAY} <= $3::date)`;
const counts = "count(*) FILTER (WHERE f.sentiment = 'positive')::integer AS positive_count, count(*) FILTER (WHERE f.sentiment = 'neutral')::integer AS neutral_count, count(*) FILTER (WHERE f.sentiment = 'negative')::integer AS negative_count, count(*)::integer AS total_count";

export async function trend(client: PoolClient, tenantId: string, from: string | null, to: string | null, jobId: string | null = null) { return (await client.query(`SELECT to_char(${DAY}, 'YYYY-MM-DD') AS day, ${counts} FROM feedback_items f WHERE ${WHERE} GROUP BY 1 ORDER BY 1`, [tenantId, from, to, jobId])).rows; }
/** Sentiment per uploaded file; the file name is the feedback's source. */
export async function fileCounts(client: PoolClient, tenantId: string, from: string | null, to: string | null, jobId: string | null = null) { return (await client.query(`SELECT j.id AS file_id, COALESCE(j.original_filename, 'Other data') AS file_name, ${counts} FROM feedback_items f LEFT JOIN ingestion_jobs j ON j.id = f.ingestion_job_id WHERE ${WHERE} GROUP BY j.id, COALESCE(j.original_filename, 'Other data') ORDER BY total_count DESC, file_name`, [tenantId, from, to, jobId])).rows; }
export async function themeCounts(client: PoolClient, tenantId: string, from: string | null, to: string | null, limit: number, jobId: string | null = null) { return (await client.query(`SELECT t.id AS theme_id, t.name AS theme_name, ${counts} FROM feedback_items f JOIN feedback_item_themes fit ON fit.feedback_item_id = f.id JOIN themes t ON t.id = fit.theme_id WHERE ${WHERE} GROUP BY t.id, t.name ORDER BY total_count DESC, t.name LIMIT $5`, [tenantId, from, to, jobId, limit])).rows; }

const STOP_WORDS = ['about', 'after', 'again', 'also', 'always', 'because', 'been', 'before', 'being', 'both', 'cannot', 'could', 'does', 'doing', 'done', 'each', 'even', 'ever', 'every', 'from', 'have', 'having', 'here', 'into', 'just', 'like', 'made', 'make', 'many', 'more', 'most', 'much', 'never', 'only', 'other', 'over', 'really', 'same', 'should', 'since', 'some', 'still', 'such', 'than', 'thank', 'thanks', 'that', 'their', 'them', 'then', 'there', 'these', 'they', 'this', 'those', 'though', 'through', 'very', 'want', 'were', 'what', 'when', 'where', 'which', 'while', 'will', 'with', 'without', 'would', 'your', 'youre', 'weeks', 'today', 'first', 'time', 'times', 'something', 'anything', 'nothing', 'lost', 'cant'];
/** Most frequent meaningful words, counted once per feedback item, with the sentiment split of the items using each. */
export async function keywordCounts(client: PoolClient, tenantId: string, from: string | null, to: string | null, limit: number, jobId: string | null = null) {
  return (await client.query(`SELECT w.word, count(DISTINCT f.id)::integer AS total_count, count(DISTINCT f.id) FILTER (WHERE f.sentiment = 'positive')::integer AS positive_count, count(DISTINCT f.id) FILTER (WHERE f.sentiment = 'neutral')::integer AS neutral_count, count(DISTINCT f.id) FILTER (WHERE f.sentiment = 'negative')::integer AS negative_count FROM feedback_items f CROSS JOIN LATERAL regexp_split_to_table(lower(f.raw_text), '[^a-z]+') AS w(word) WHERE ${WHERE} AND length(w.word) >= 4 AND w.word <> ALL($5::text[]) GROUP BY w.word HAVING count(DISTINCT f.id) >= 2 ORDER BY total_count DESC, w.word LIMIT $6`, [tenantId, from, to, jobId, STOP_WORDS, limit])).rows;
}

/** Progress of the post-upload pipeline (sentiment, embeddings, theme clustering) for all files or one file. */
export async function pipelineStatus(client: PoolClient, tenantId: string, jobId: string | null) {
  const counts = (await client.query<{ total: number; classified: number; embedded: number }>('SELECT count(*)::integer AS total, count(f.sentiment)::integer AS classified, count(e.feedback_item_id)::integer AS embedded FROM feedback_items f LEFT JOIN feedback_embeddings e ON e.feedback_item_id = f.id WHERE f.tenant_id = $1 AND ($2::uuid IS NULL OR f.ingestion_job_id = $2::uuid)', [tenantId, jobId])).rows[0];
  const stamps = (await client.query<{ clustered_at: string | null; embedded_at: string | null }>('SELECT (SELECT max(last_clustered_at) FROM themes WHERE tenant_id = $1) AS clustered_at, (SELECT max(updated_at) FROM feedback_embeddings WHERE tenant_id = $1) AS embedded_at', [tenantId])).rows[0];
  const themesDone = counts.total < 3 || (counts.embedded === counts.total && stamps.clustered_at !== null && (stamps.embedded_at === null || new Date(stamps.clustered_at) >= new Date(stamps.embedded_at)));
  return { ...counts, themesDone, processing: counts.classified < counts.total || counts.embedded < counts.total || !themesDone };
}
