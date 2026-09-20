import { Queue, Worker } from 'bullmq';
import { workerDb } from '../lib/server/db';
import { fetchWithRetry } from '../lib/server/ai-client';
import { redactForModel } from '../lib/server/pii';

type Item = { id: string; raw_text: string; embedding: string };
type Cluster = { name: string; feedback_ids: string[] };
const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';
const queue = new Queue('theme-clustering', { connection: { url: redisUrl } });
const aiUrl = process.env.AI_SERVICE_URL ?? 'http://localhost:8000';
const vector = (value: string) => value.slice(1, -1).split(',').map(Number);
const pgVector = (value: number[]) => `[${value.join(',')}]`;
const normalized = (name: string) => name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
function centroid(vectors: number[][]) { const result = Array<number>(1536).fill(0); for (const value of vectors) for (let index = 0; index < value.length; index++) result[index] += value[index]; const magnitude = Math.hypot(...result); return result.map((value) => value / (magnitude || 1)); }

async function clusterTenant(tenantId: string) {
  const items = (await workerDb.query<Item>(`SELECT f.id, f.raw_text, e.embedding::text FROM feedback_items f JOIN feedback_embeddings e ON e.feedback_item_id = f.id WHERE f.tenant_id = $1 AND e.tenant_id = $1 ORDER BY f.created_at DESC LIMIT 5000`, [tenantId])).rows;
  if (items.length < 3) return { themes: 0, assigned: 0 };
  const response = await fetchWithRetry(`${aiUrl}/v1/themes/cluster`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-internal-token': process.env.AI_SERVICE_TOKEN ?? '' }, body: JSON.stringify({ items: items.map((item) => ({ id: item.id, text: redactForModel(item.raw_text), embedding: vector(item.embedding) })) }) });
  if (response.status === 429) throw new Error('Theme service rate-limited clustering.');
  if (!response.ok) throw new Error(`Theme service failed (${response.status}).`);
  const { themes } = await response.json() as { themes: Cluster[] };
  const byId = new Map(items.map((item) => [item.id, item]));
  const client = await workerDb.connect();
  await client.query('BEGIN');
  try {
    await client.query('DELETE FROM feedback_item_themes WHERE tenant_id = $1', [tenantId]);
    let assigned = 0;
    for (const theme of themes) {
      const members = theme.feedback_ids.map((id) => byId.get(id)).filter((item): item is Item => Boolean(item)); if (members.length < 3) continue;
      const center = centroid(members.map((item) => vector(item.embedding)));
      // Reuse a very similar prior centroid so weekly reclustering preserves the established theme name.
      const prior = await client.query<{ id: string }>('SELECT id FROM themes WHERE tenant_id = $1 AND 1 - (centroid <=> $2::vector) >= 0.90 ORDER BY centroid <=> $2::vector LIMIT 1', [tenantId, pgVector(center)]);
      const themeId = prior.rows[0]?.id ?? (await client.query<{ id: string }>(`INSERT INTO themes (tenant_id, name, normalized_name, centroid) VALUES ($1, $2, $3, $4::vector) ON CONFLICT (tenant_id, normalized_name) DO UPDATE SET centroid = EXCLUDED.centroid, last_clustered_at = now(), updated_at = now() RETURNING id`, [tenantId, theme.name, normalized(theme.name) || 'customer-feedback', pgVector(center)])).rows[0].id;
      if (prior.rows[0]) await client.query('UPDATE themes SET centroid = $2::vector, last_clustered_at = now(), updated_at = now() WHERE id = $1', [themeId, pgVector(center)]);
      for (const member of members) { await client.query('INSERT INTO feedback_item_themes (feedback_item_id, theme_id, tenant_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [member.id, themeId, tenantId]); assigned++; }
    }
    await client.query('COMMIT'); return { themes: themes.length, assigned };
  } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
}
async function clusterAllTenants() { const tenants = await workerDb.query<{ tenant_id: string }>('SELECT DISTINCT tenant_id FROM feedback_embeddings'); return Promise.all(tenants.rows.map(({ tenant_id }) => clusterTenant(tenant_id))); }
const reclusterEvery = process.env.NODE_ENV === 'production' ? 7 * 24 * 60 * 60 * 1000 : 30_000;
async function start() { await queue.upsertJobScheduler('recluster-feedback', { every: reclusterEvery }, { name: 'recluster-feedback', data: {}, opts: { attempts: 3, backoff: { type: 'exponential', delay: 10_000 }, removeOnComplete: 20, removeOnFail: 100 } }); const worker = new Worker('theme-clustering', async () => clusterAllTenants(), { connection: { url: redisUrl }, concurrency: 1 }); worker.on('failed', (job, error) => console.error(`Theme job ${job?.id} failed:`, error.message)); console.log('LOOP theme worker is running.'); }
void start().catch((error) => { console.error('Unable to start theme worker', error); process.exitCode = 1; });
