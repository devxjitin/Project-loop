import { NextRequest } from 'next/server';
import { AuthError, requireActiveAuth, requireRole } from '@/lib/server/auth';
import { setTenantContext, withTransaction } from '@/lib/server/db';
import { newOAuthState, stateHash } from '@/lib/server/zendesk';

export const runtime = 'nodejs';
export async function POST(request: NextRequest) {
  try {
    const claims = await requireActiveAuth(request); requireRole(claims, 'admin');
    const { subdomain } = await request.json() as { subdomain?: string };
    const normalized = subdomain?.trim().toLowerCase().replace(/\.zendesk\.com$/, '');
    if (!normalized || !/^[a-z0-9][a-z0-9-]{0,61}[a-z0-9]$/.test(normalized)) return Response.json({ error: 'Enter a valid Zendesk subdomain.' }, { status: 400 });
    const clientId = process.env.ZENDESK_CLIENT_ID; const callback = process.env.ZENDESK_OAUTH_CALLBACK_URL;
    if (!clientId || !callback) return Response.json({ error: 'Zendesk OAuth is not configured.' }, { status: 503 });
    let state = '';
    await withTransaction(async (client) => {
      await setTenantContext(client, claims.tenantId);
      const connector = await client.query<{ id: string }>(`INSERT INTO connectors (tenant_id, type, status, subdomain)
        VALUES ($1, 'zendesk', 'pending', $2)
        ON CONFLICT (tenant_id, type) DO UPDATE SET status = 'pending', subdomain = EXCLUDED.subdomain, last_error = NULL, updated_at = now()
        RETURNING id`, [claims.tenantId, normalized]);
      state = newOAuthState(claims.tenantId, connector.rows[0].id);
      await client.query('DELETE FROM connector_oauth_states WHERE expires_at < now()');
      await client.query('INSERT INTO connector_oauth_states (state_hash, tenant_id, connector_id, expires_at) VALUES ($1, $2, $3, now() + interval \'10 minutes\')', [stateHash(state), claims.tenantId, connector.rows[0].id]);
    });
    const url = new URL(`https://${normalized}.zendesk.com/oauth/authorizations/new`);
    url.searchParams.set('response_type', 'code'); url.searchParams.set('redirect_uri', callback); url.searchParams.set('client_id', clientId); url.searchParams.set('scope', 'read'); url.searchParams.set('state', state);
    return Response.json({ authorizationUrl: url.toString() });
  } catch (error) {
    if (error instanceof AuthError) return Response.json({ error: error.message }, { status: error.status });
    console.error('Start Zendesk OAuth failed', error); return Response.json({ error: 'Unable to start Zendesk connection.' }, { status: 500 });
  }
}
