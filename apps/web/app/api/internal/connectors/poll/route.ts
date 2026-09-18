import { NextRequest } from 'next/server';
import { workerDb } from '@/lib/server/db';
import { hasValidCronSecret } from '@/lib/server/internal-auth';
import { syncZendeskConnector } from '@/lib/server/zendesk';

export const runtime = 'nodejs';
/** Invoke every 15 minutes from a scheduler. The separate worker DB role must have BYPASSRLS. */
export async function POST(request: NextRequest) {
  if (!hasValidCronSecret(request)) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const due = await workerDb.query<{ id: string }>("SELECT id FROM connectors WHERE status = 'connected' AND (last_synced_at IS NULL OR last_synced_at < now() - interval '15 minutes') ORDER BY last_synced_at NULLS FIRST LIMIT 100");
  const results = await Promise.allSettled(due.rows.map(({ id }) => syncZendeskConnector(id)));
  return Response.json({ checked: due.rowCount, synced: results.filter((result) => result.status === 'fulfilled').length, failed: results.filter((result) => result.status === 'rejected').length });
}
