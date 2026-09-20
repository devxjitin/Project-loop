import { createHash } from 'node:crypto';
import { Queue, Worker } from 'bullmq';
import { workerDb } from '../lib/server/db';
import { fetchWithRetry } from '../lib/server/ai-client';
import { redactForModel } from '../lib/server/pii';

type FeedbackRow = { id: string; raw_text: string };
type CachedRow = { content_hash: string; sentiment: 'positive' | 'neutral' | 'negative' };
type AiResponse = { classifications: Array<{ id: string; sentiment: 'positive' | 'neutral' | 'negative' }> };
const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';
const queue = new Queue('sentiment-classification', { connection: { url: redisUrl } });
const aiUrl = process.env.AI_SERVICE_URL ?? 'http://localhost:8000';

function hash(text: string) { return createHash('sha256').update(text.trim().replace(/\s+/g, ' ')).digest('hex'); }
async function setSentiments(pairs: Array<[string, string]>) {
  if (pairs.length) await workerDb.query('UPDATE feedback_items f SET sentiment = v.s::sentiment_label, updated_at = now() FROM unnest($1::uuid[], $2::text[]) AS v(id, s) WHERE f.id = v.id AND f.sentiment IS NULL', [pairs.map((pair) => pair[0]), pairs.map((pair) => pair[1])]);
}
// Keep going until nothing is pending instead of waiting for the next scheduled scan between batches.
let pausedUntil = 0;
async function classifyAllPending() {
  if (Date.now() < pausedUntil) return { classified: 0 };
  let total = 0;
  for (let batch = 0; batch < 200; batch++) {
    let result; try { result = await classifyPending(); } catch (error) { if (error instanceof Error && /rate-limited/.test(error.message)) { pausedUntil = Date.now() + 45_000; break; } throw error; }
    if (!result.classified) break; total += result.classified;
  }
  return { classified: total };
}
async function classifyPending() {
  const rows = (await workerDb.query<FeedbackRow>('SELECT id, raw_text FROM feedback_items WHERE sentiment IS NULL ORDER BY created_at ASC LIMIT 100')).rows;
  if (!rows.length) return { classified: 0, cached: 0 };
  const hashes = [...new Set(rows.map((row) => hash(row.raw_text)))];
  const cache = await workerDb.query<CachedRow>('SELECT content_hash, sentiment FROM sentiment_cache WHERE content_hash = ANY($1)', [hashes]);
  const cached = new Map(cache.rows.map((row) => [row.content_hash, row.sentiment]));
  const cachedRows = rows.filter((row) => cached.has(hash(row.raw_text)));
  await setSentiments(cachedRows.map((row) => [row.id, cached.get(hash(row.raw_text))!]));
  const unique = new Map<string, FeedbackRow>(); for (const row of rows.filter((row) => !cached.has(hash(row.raw_text)))) unique.set(hash(row.raw_text), row);
  if (!unique.size) return { classified: cachedRows.length, cached: cachedRows.length };
  const response = await fetchWithRetry(`${aiUrl}/v1/sentiment/classify`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-internal-token': process.env.AI_SERVICE_TOKEN ?? '' }, body: JSON.stringify({ items: [...unique.entries()].map(([id, row]) => ({ id, text: redactForModel(row.raw_text) })) }) });
  if (response.status === 429) throw new Error('AI service rate-limited classification.');
  if (!response.ok) throw new Error(`AI service failed (${response.status}).`);
  const body = await response.json() as AiResponse;
  const labels = new Map(body.classifications.map((item) => [item.id, item.sentiment]));
  if (labels.size !== unique.size) throw new Error('AI service returned an incomplete batch.');
  if (labels.size) await workerDb.query('INSERT INTO sentiment_cache (content_hash, sentiment) SELECT h, s::sentiment_label FROM unnest($1::text[], $2::text[]) AS v(h, s) ON CONFLICT (content_hash) DO NOTHING', [[...labels.keys()], [...labels.values()]]);
  await setSentiments(rows.flatMap((row) => { const label = cached.get(hash(row.raw_text)) ?? labels.get(hash(row.raw_text)); return label ? [[row.id, label] as [string, string]] : []; }));
  return { classified: rows.length, cached: cachedRows.length };
}

async function start() { await queue.upsertJobScheduler('classify-new-feedback', { every: 10_000 }, { name: 'scan', data: {}, opts: { attempts: 5, backoff: { type: 'exponential', delay: 1_000 }, removeOnComplete: 100, removeOnFail: 500 } }); const worker = new Worker('sentiment-classification', async () => classifyAllPending(), { connection: { url: redisUrl }, concurrency: 1 }); worker.on('failed', (job, error) => console.error(`Sentiment job ${job?.id} failed:`, error.message)); console.log('LOOP sentiment worker is running.'); }
void start().catch((error) => { console.error('Unable to start sentiment worker', error); process.exitCode = 1; });
