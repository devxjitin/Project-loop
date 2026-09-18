import { Queue } from 'bullmq';
import { NextRequest } from 'next/server';
import { hasValidCronSecret } from '@/lib/server/internal-auth';

export const runtime = 'nodejs';
export async function POST(request: NextRequest) {
  if (!hasValidCronSecret(request)) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const queue = new Queue('theme-clustering', { connection: { url: process.env.REDIS_URL ?? 'redis://localhost:6379' } });
  await queue.add('recluster', {}, { jobId: `recluster-${Date.now()}`, attempts: 3, backoff: { type: 'exponential', delay: 10_000 }, removeOnComplete: true });
  await queue.close();
  return Response.json({ queued: true });
}
