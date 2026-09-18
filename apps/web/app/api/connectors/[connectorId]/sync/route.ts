import { NextRequest } from 'next/server';
import { AuthError, requireActiveAuth, requireRole } from '@/lib/server/auth';
import { setTenantContext, withTransaction } from '@/lib/server/db';
import { syncZendeskConnector } from '@/lib/server/zendesk';

export const runtime = 'nodejs';
export async function POST(request: NextRequest, { params }: { params: Promise<{ connectorId: string }> }) {
  try {
    const claims = await requireActiveAuth(request); requireRole(claims, 'admin', 'editor'); const { connectorId } = await params;
    const exists = await withTransaction(async (client) => { await setTenantContext(client, claims.tenantId); return (await client.query('SELECT id FROM connectors WHERE id = $1', [connectorId])).rowCount; });
    if (!exists) return Response.json({ error: 'Connector not found.' }, { status: 404 });
    return Response.json(await syncZendeskConnector(connectorId));
  } catch (error) { if (error instanceof AuthError) return Response.json({ error: error.message }, { status: error.status }); console.error('Zendesk sync failed', error); return Response.json({ error: 'Zendesk sync failed. Check the connector status.' }, { status: 502 }); }
}
