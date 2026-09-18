import { after } from 'next/server';

// Free hosting suspends idle workers. When WORKER_WAKE_URL is set, ping it once work has been queued;
// the request is held by the host while the instance boots. Best effort: failures are ignored.
export function wakeWorkers() {
  const url = process.env.WORKER_WAKE_URL;
  if (!url) return;
  after(async () => {
    try { await fetch(`${url.replace(/\/$/, '')}/health`, { signal: AbortSignal.timeout(90_000) }); } catch { /* workers will pick the work up on the next wake */ }
  });
}
