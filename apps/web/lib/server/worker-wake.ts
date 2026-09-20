import { after } from 'next/server';

// Free hosting suspends idle services. When WORKER_WAKE_URL is set, ping it once work has been queued; the
// request is held by the host while the instance boots. The AI service sleeps the same way, so it is woken at
// the same time and both boot in parallel instead of the workers finding it asleep. Best effort: failures are
// ignored and the workers retry the AI service themselves.
export function wakeWorkers() {
  const targets = [process.env.WORKER_WAKE_URL, process.env.AI_SERVICE_URL].filter((url): url is string => Boolean(url) && /^https?:\/\//.test(url ?? ''));
  if (!targets.length) return;
  after(async () => {
    await Promise.allSettled(targets.map((url) => fetch(`${url.replace(/\/$/, '')}/health`, { signal: AbortSignal.timeout(90_000) })));
  });
}
