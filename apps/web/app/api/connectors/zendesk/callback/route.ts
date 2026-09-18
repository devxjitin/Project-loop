import { NextRequest } from 'next/server';
import { setTenantContext, withTransaction } from '@/lib/server/db';
import { saveZendeskCredentials } from '@/lib/server/secrets';
import { readOAuthState, stateHash } from '@/lib/server/zendesk';

export const runtime = 'nodejs';
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code'); const state = request.nextUrl.searchParams.get('state');
  const complete = new URL('/?connector=zendesk', request.url);
  if (!code || !state) { complete.searchParams.set('error', 'Missing OAuth code or state.'); return Response.redirect(complete); }
  try {
    const claims = readOAuthState(state); if (!claims) throw new Error('OAuth session is invalid or expired.');
    const row = await withTransaction(async (client) => { await setTenantContext(client, claims.tenantId); const result = await client.query<{ tenant_id: string; connector_id: string; subdomain: string }>(`SELECT s.tenant_id, s.connector_id, c.subdomain FROM connector_oauth_states s JOIN connectors c ON c.id = s.connector_id WHERE s.state_hash = $1 AND s.connector_id = $2 AND s.expires_at > now()`, [stateHash(state), claims.connectorId]); return result.rows[0]; });
    if (!row?.subdomain) throw new Error('OAuth session expired. Start the connection again.');
    const clientId = process.env.ZENDESK_CLIENT_ID; const clientSecret = process.env.ZENDESK_CLIENT_SECRET; const callback = process.env.ZENDESK_OAUTH_CALLBACK_URL;
    if (!clientId || !clientSecret || !callback) throw new Error('Zendesk OAuth is not configured.');
    const token = await fetch(`https://${row.subdomain}.zendesk.com/oauth/tokens`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ grant_type: 'authorization_code', code, client_id: clientId, client_secret: clientSecret, redirect_uri: callback }) });
    if (!token.ok) throw new Error('Zendesk did not accept the authorization code.');
    const payload = await token.json() as { access_token?: string; refresh_token?: string };
    if (!payload.access_token) throw new Error('Zendesk returned no access token.');
    const ref = await saveZendeskCredentials(row.connector_id, { accessToken: payload.access_token, refreshToken: payload.refresh_token });
    await withTransaction(async (client) => { await setTenantContext(client, row.tenant_id); await client.query("UPDATE connectors SET credentials_ref = $2, status = 'connected', last_error = NULL, updated_at = now() WHERE id = $1", [row.connector_id, ref]); await client.query('DELETE FROM connector_oauth_states WHERE state_hash = $1', [stateHash(state)]); });
    complete.searchParams.set('connected', '1'); return Response.redirect(complete);
  } catch (error) { complete.searchParams.set('error', error instanceof Error ? error.message : 'Unable to finish Zendesk connection.'); return Response.redirect(complete); }
}
