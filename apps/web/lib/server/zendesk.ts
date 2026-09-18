import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { PoolClient } from 'pg';
import { db, setTenantContext, withTransaction, workerDb } from './db';
import { getZendeskCredentials } from './secrets';

type Connector = { id: string; tenant_id: string; subdomain: string | null; credentials_ref: string | null; sync_cursor: string | null };
type ZendeskTicket = { id: number | string; description?: string; subject?: string; requester?: { name?: string }; created_at?: string; url?: string; updated_at?: string };

export const ZENDESK_SOURCE = 'zendesk';
export function newOAuthState(tenantId?: string, connectorId?: string) {
  if (!tenantId || !connectorId) return randomBytes(32).toString('base64url');
  const expires = Math.floor(Date.now() / 1000) + 600;
  const payload = `${tenantId}.${connectorId}.${expires}.${randomBytes(12).toString('base64url')}`;
  return `${Buffer.from(payload).toString('base64url')}.${createHmac('sha256', process.env.CONNECTOR_STATE_SECRET || process.env.JWT_SECRET || 'development-only-state-secret').update(payload).digest('base64url')}`;
}
export function stateHash(state: string) { return createHmac('sha256', process.env.CONNECTOR_STATE_SECRET || process.env.JWT_SECRET || 'development-only-state-secret').update(state).digest('hex'); }
export function readOAuthState(state: string) {
  const [encoded, signature] = state.split('.'); if (!encoded || !signature) return null;
  const payload = Buffer.from(encoded, 'base64url').toString();
  const expected = createHmac('sha256', process.env.CONNECTOR_STATE_SECRET || process.env.JWT_SECRET || 'development-only-state-secret').update(payload).digest('base64url');
  const a = Buffer.from(expected); const b = Buffer.from(signature);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  const [tenantId, connectorId, expires] = payload.split('.');
  return tenantId && connectorId && Number(expires) > Date.now() / 1000 ? { tenantId, connectorId } : null;
}

export function verifyZendeskSignature(rawBody: string, timestamp: string | null, signature: string | null, secret: string) {
  if (!timestamp || !signature) return false;
  const expected = createHmac('sha256', secret).update(`${timestamp}${rawBody}`).digest('base64');
  const received = signature.replace(/^sha256=/i, '');
  const left = Buffer.from(expected); const right = Buffer.from(received);
  return left.length === right.length && timingSafeEqual(left, right);
}

function ticketText(ticket: ZendeskTicket) { return [ticket.subject, ticket.description].filter(Boolean).join('\n\n').trim(); }
export async function upsertZendeskTicket(client: PoolClient, tenantId: string, connectorId: string, ticket: ZendeskTicket) {
  const rawText = ticketText(ticket);
  if (!rawText) return false;
  await client.query(`INSERT INTO feedback_items (tenant_id, source, external_id, raw_text, author, source_url, occurred_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    ON CONFLICT (tenant_id, source, external_id) DO UPDATE SET raw_text = EXCLUDED.raw_text, author = EXCLUDED.author, source_url = EXCLUDED.source_url, occurred_at = EXCLUDED.occurred_at, updated_at = now()`,
    [tenantId, ZENDESK_SOURCE, String(ticket.id), rawText, ticket.requester?.name ?? null, ticket.url ?? null, ticket.created_at ?? null]);
  return true;
}

export async function syncZendeskConnector(connectorId: string) {
  const found = await workerDb.query<Connector>('SELECT id, tenant_id, subdomain, credentials_ref, sync_cursor FROM connectors WHERE id = $1 AND status = $2', [connectorId, 'connected']);
  const connector = found.rows[0];
  if (!connector?.subdomain || !connector.credentials_ref) throw new Error('Zendesk connector is not ready to sync.');
  try {
    const credentials = await getZendeskCredentials(connector.credentials_ref);
    const base = `https://${connector.subdomain}.zendesk.com/api/v2/incremental/tickets/cursor.json`;
    const url = connector.sync_cursor ? `${base}?cursor=${encodeURIComponent(connector.sync_cursor)}` : `${base}?start_time=${Math.floor(Date.now() / 1000) - 900}`;
    const response = await fetch(url, { headers: { Authorization: `Bearer ${credentials.accessToken}`, Accept: 'application/json' } });
    if (response.status === 401 || response.status === 403) {
      await workerDb.query("UPDATE connectors SET status = 'revoked', last_error = 'Zendesk authorization was revoked. Reconnect to resume sync.', updated_at = now() WHERE id = $1", [connectorId]);
      return { status: 'revoked', imported: 0 };
    }
    if (!response.ok) throw new Error(`Zendesk sync failed (${response.status}).`);
    const payload = await response.json() as { tickets?: ZendeskTicket[]; after_cursor?: string; end_of_stream?: boolean };
    const imported = await withTransaction(async (client) => {
      await setTenantContext(client, connector.tenant_id); let count = 0;
      for (const ticket of payload.tickets ?? []) if (await upsertZendeskTicket(client, connector.tenant_id, connector.id, ticket)) count++;
      await client.query("UPDATE connectors SET sync_cursor = $2, last_synced_at = now(), last_error = NULL, status = 'connected', updated_at = now() WHERE id = $1", [connector.id, payload.after_cursor ?? connector.sync_cursor]);
      return count;
    });
    return { status: 'connected', imported };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown Zendesk sync error.';
    await workerDb.query("UPDATE connectors SET status = 'error', last_error = $2, updated_at = now() WHERE id = $1", [connectorId, message]);
    throw error;
  }
}
