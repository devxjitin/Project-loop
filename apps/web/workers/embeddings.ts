import { createHash } from 'node:crypto';
import { Queue, Worker } from 'bullmq';
import { workerDb } from '../lib/server/db';
import { redactForModel } from '../lib/server/pii';

type FeedbackRow = { id: string; tenant_id: string; raw_text: string };
type AiResponse = { embeddings: Array<{ id: string; embedding: number[] }> };
const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';
const queue = new Queue('embedding-generation', { connection: { url: redisUrl } });
const themeQueue = new Queue('theme-clustering', { connection: { url: redisUrl } });
const aiUrl = process.env.AI_SERVICE_URL ?? 'http://localhost:8000';
const hash = (text: string) => createHash('sha256').update(text.trim().replace(/\s+/g, ' ')).digest('hex');
const pgVector = (values: number[]) => `[${values.join(',')}]`;

async function embedPending() {
  const rows = (await workerDb.query<FeedbackRow>(`SELECT f.id, f.tenant_id, f.raw_text FROM feedback_items f
    LEFT JOIN feedback_embeddings e ON e.feedback_item_id = f.id AND e.text_hash = encode(digest(convert_to(trim(regexp_replace(f.raw_text, '\\s+', ' ', 'g')), 'UTF8'), 'sha256'), 'hex')
    WHERE e.feedback_item_id IS NULL ORDER BY f.created_at ASC LIMIT 100`)).rows;
  if (!rows.length) return { embedded: 0, ids: [] as string[] };
  const response = await fetch(`${aiUrl}/v1/embeddings`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-internal-token': process.env.AI_SERVICE_TOKEN ?? '' }, body: JSON.stringify({ items: rows.map((row) => ({ id: row.id, text: redactForModel(row.raw_text) })) }) });
  if (response.status === 429) throw new Error('Embedding service rate-limited the batch.');
  if (!response.ok) throw new Error(`Embedding service failed (${response.status}).`);
  const body = await response.json() as AiResponse; const vectors = new Map(body.embeddings.map((item) => [item.id, item.embedding]));
  if (vectors.size !== rows.length || [...vectors.values()].some((vector) => vector.length !== 1536)) throw new Error('Embedding service returned an invalid vector batch.');
  await workerDb.query(`INSERT INTO feedback_embeddings (feedback_item_id, tenant_id, text_hash, embedding)
    SELECT v.id, v.tenant_id, v.h, v.e::vector FROM unnest($1::uuid[], $2::uuid[], $3::text[], $4::text[]) AS v(id, tenant_id, h, e)
    ON CONFLICT (feedback_item_id) DO UPDATE SET text_hash = EXCLUDED.text_hash, embedding = EXCLUDED.embedding, updated_at = now()`, [rows.map((row) => row.id), rows.map((row) => row.tenant_id), rows.map((row) => hash(row.raw_text)), rows.map((row) => pgVector(vectors.get(row.id)!))]);
  return { embedded: rows.length, ids: rows.map((row) => row.id) };
}

// Drain every pending batch in one run, then queue theme clustering (debounced) so new uploads get themes
// within seconds instead of waiting for the weekly recluster. Stops if a batch makes no progress.
async function embedAllPending() {
  let total = 0; const seen = new Set<string>();
  for (let batch = 0; batch < 100; batch++) {
    const result = await embedPending(); if (!result.embedded) break;
    const fresh = result.ids.filter((id) => !seen.has(id)); result.ids.forEach((id) => seen.add(id));
    if (!fresh.length) break;
    total += fresh.length;
  }
  if (total) await themeQueue.add('recluster', {}, { jobId: 'recluster-after-embed', delay: 5_000, attempts: 3, backoff: { type: 'exponential', delay: 10_000 }, removeOnComplete: true, removeOnFail: 50 });
  return { embedded: total };
}

async function start() { await queue.upsertJobScheduler('embed-new-feedback', { every: 10_000 }, { name: 'scan', data: {}, opts: { attempts: 5, backoff: { type: 'exponential', delay: 1_000 }, removeOnComplete: 100, removeOnFail: 500 } }); const worker = new Worker('embedding-generation', async () => embedAllPending(), { connection: { url: redisUrl }, concurrency: 1 }); worker.on('failed', (job, error) => console.error(`Embedding job ${job?.id} failed:`, error.message)); console.log('LOOP embedding worker is running.'); }
void start().catch((error) => { console.error('Unable to start embedding worker', error); process.exitCode = 1; });
