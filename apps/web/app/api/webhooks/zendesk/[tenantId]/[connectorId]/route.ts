import { NextRequest } from 'next/server';
import { setTenantContext, withTransaction } from '@/lib/server/db';
import { upsertZendeskTicket, verifyZendeskSignature } from '@/lib/server/zendesk';

export const runtime = 'nodejs';
export async function POST(request: NextRequest, { params }: { params: Promise<{ tenantId: string; connectorId: string }> }) {
  const { tenantId, connectorId } = await params; const raw = await request.text();
  try {
    const verified = await withTransaction(async (client) => { await setTenantContext(client, tenantId); const connector = await client.query<{ webhook_secret: string }>("SELECT webhook_secret FROM connectors WHERE id = $1 AND type = 'zendesk' AND status = 'connected'", [connectorId]); const secret = connector.rows[0]?.webhook_secret; return Boolean(secret && verifyZendeskSignature(raw, request.headers.get('x-zendesk-webhook-signature-timestamp'), request.headers.get('x-zendesk-webhook-signature'), secret)); });
    if (!verified) return Response.json({ error: 'Invalid webhook signature.' }, { status: 401 });
    const payload = JSON.parse(raw) as { detail?: { ticket?: unknown }; ticket?: unknown };
    const ticket = (payload.detail?.ticket ?? payload.ticket) as Parameters<typeof upsertZendeskTicket>[3];
    if (!ticket?.id) return Response.json({ received: true, imported: false });
    await withTransaction(async (client) => { await setTenantContext(client, tenantId); await upsertZendeskTicket(client, tenantId, connectorId, ticket); await client.query('UPDATE connectors SET last_synced_at = now(), last_error = NULL, updated_at = now() WHERE id = $1', [connectorId]); });
    return Response.json({ received: true, imported: true });
  } catch (error) { console.error('Zendesk webhook failed', error); return Response.json({ error: 'Webhook could not be processed.' }, { status: 500 }); }
}
