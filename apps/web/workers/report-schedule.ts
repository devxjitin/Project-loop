import { Queue, Worker } from 'bullmq';
import { generateDueScheduledReports } from '../lib/server/scheduled-reports';

const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';
const queue = new Queue('report-scheduling', { connection: { url: redisUrl } });

async function start() {
  await queue.upsertJobScheduler(
    'generate-due-reports',
    { every: 15 * 60_000 },
    { name: 'generate-due-reports', data: {}, opts: { attempts: 3, backoff: { type: 'exponential', delay: 5_000 } } },
  );
  const worker = new Worker('report-scheduling', async () => generateDueScheduledReports(), { connection: { url: redisUrl }, concurrency: 1 });
  worker.on('failed', (job, error) => console.error(`Report-schedule job ${job?.id} failed:`, error.message));
  console.log('LOOP report-schedule worker is running.');
}

void start().catch((error) => {
  console.error('Unable to start report-schedule worker', error);
  process.exitCode = 1;
});
