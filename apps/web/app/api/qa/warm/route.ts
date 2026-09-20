import { NextRequest } from 'next/server';
import { after } from 'next/server';
import { AuthError, requireActiveAuth } from '@/lib/server/auth';

export const runtime = 'nodejs';
/** Wakes the AI service (free hosting suspends it when idle) so the first question does not hit a cold start. */
export async function GET(request: NextRequest) {
  try {
    await requireActiveAuth(request);
    const url = process.env.AI_SERVICE_URL;
    if (url && /^https?:\/\//.test(url)) after(async () => { try { await fetch(`${url.replace(/\/$/, '')}/health`, { signal: AbortSignal.timeout(90_000) }); } catch { /* best effort */ } });
    return Response.json({ ok: true });
  } catch (error) { if (error instanceof AuthError) return Response.json({ error: error.message }, { status: error.status }); return Response.json({ ok: false }, { status: 500 }); }
}
