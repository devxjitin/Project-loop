import { NextRequest } from 'next/server';
import { AuthError, requireActiveAuth, requireRole } from '@/lib/server/auth';
import { setTenantContext, withTransaction } from '@/lib/server/db';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const claims = await requireActiveAuth(request);
    requireRole(claims, 'admin', 'editor');
    const connectors = await withTransaction(async (client) => {
      await setTenantContext(client, claims.tenantId);
      return (await client.query<{ id: string; type: string; status: string; subdomain: string | null; config: { name?: string } | null; last_synced_at: string | null; last_error: string | null; created_at: string; webhook_secret: string }>('SELECT id, type, status, subdomain, config, last_synced_at, last_error, created_at, webhook_secret FROM connectors ORDER BY created_at DESC')).rows;
    });
    return Response.json({ connectors: connectors.map(({ webhook_secret, ...connector }) => ({ ...connector, ...(claims.role === 'admin' ? { webhookUrl: new URL(connector.type === 'zendesk' ? `/api/webhooks/zendesk/${claims.tenantId}/${connector.id}` : `/api/webhooks/inbound/${claims.tenantId}/${connector.id}`, request.url).toString(), webhookSecret: webhook_secret } : {}) })) });
  } catch (error) {
    if (error instanceof AuthError) return Response.json({ error: error.message }, { status: error.status });
    console.error('List connectors failed', error);
    return Response.json({ error: 'Unable to load connectors.' }, { status: 500 });
  }
}
