import { Queue } from 'bullmq';
import { NextRequest } from 'next/server';
import { hasValidCronSecret } from '@/lib/server/internal-auth';

export const runtime = 'nodejs';
/** Queue an immediate idempotent scan; the worker's recurring scan handles the remaining batches. */
export async function POST(request: NextRequest) {
  if (!hasValidCronSecret(request)) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const queue = new Queue('embedding-generation', { connection: { url: process.env.REDIS_URL ?? 'redis://localhost:6379' } });
  await queue.add('backfill', {}, { jobId: `backfill-${Date.now()}`, attempts: 5, backoff: { type: 'exponential', delay: 1_000 }, removeOnComplete: true });
  await queue.close();
  return Response.json({ queued: true });
}
