import { NextRequest } from 'next/server';
import { setTenantContext, withTransaction } from '@/lib/server/db';
import { ingestGenericPayload, ingestTypeformPayload, type TypeformPayload, verifyWebhookSignature } from '@/lib/server/webhooks';

export const runtime = 'nodejs';
export async function POST(request: NextRequest, { params }: { params: Promise<{ tenantId: string; connectorId: string }> }) {
  const { tenantId, connectorId } = await params; const rawBody = await request.text();
  try {
    const result = await withTransaction(async (client) => {
      await setTenantContext(client, tenantId);
      const connector = await client.query<{ type: 'typeform' | 'generic_webhook'; webhook_secret: string }>("SELECT type, webhook_secret FROM connectors WHERE id = $1 AND type IN ('typeform', 'generic_webhook') AND status = 'connected'", [connectorId]);
      const row = connector.rows[0]; const signature = request.headers.get('typeform-signature') ?? request.headers.get('x-loop-signature');
      if (!row || !verifyWebhookSignature(rawBody, signature, row.webhook_secret)) return null;
      const payload = JSON.parse(rawBody) as unknown;
      const imported = row.type === 'typeform' ? await ingestTypeformPayload(client, tenantId, payload as TypeformPayload) : await ingestGenericPayload(client, tenantId, payload);
      await client.query('UPDATE connectors SET last_synced_at = now(), last_error = NULL, updated_at = now() WHERE id = $1', [connectorId]);
      return { imported, type: row.type };
    });
    if (!result) return Response.json({ error: 'Invalid webhook signature.' }, { status: 401 });
    return Response.json({ received: true, ...result });
  } catch (error) { console.error('Inbound webhook failed', error); return Response.json({ error: 'Webhook could not be processed.' }, { status: 500 }); }
}
