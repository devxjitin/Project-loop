import { NextRequest } from 'next/server';
import { AuthError, requireActiveAuth, requireRole } from '@/lib/server/auth';
import { setTenantContext, withTransaction } from '@/lib/server/db';
import { deleteConnectorCredentials } from '@/lib/server/secrets';

export const runtime = 'nodejs';
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ connectorId: string }> }) {
  try {
    const claims = await requireActiveAuth(request); requireRole(claims, 'admin'); const { connectorId } = await params;
    const connector = await withTransaction(async (client) => { await setTenantContext(client, claims.tenantId); const result = await client.query<{ credentials_ref: string | null }>("UPDATE connectors SET status = 'disconnected', credentials_ref = NULL, sync_cursor = NULL, last_error = NULL, updated_at = now() WHERE id = $1 RETURNING credentials_ref", [connectorId]); return result.rows[0]; });
    if (!connector) return Response.json({ error: 'Connector not found.' }, { status: 404 });
    try { await deleteConnectorCredentials(connector.credentials_ref); } catch (error) { console.error('Zendesk secret deletion failed', error); }
    return Response.json({ disconnected: true });
  } catch (error) { if (error instanceof AuthError) return Response.json({ error: error.message }, { status: error.status }); console.error('Disconnect connector failed', error); return Response.json({ error: 'Unable to disconnect connector.' }, { status: 500 }); }
}
