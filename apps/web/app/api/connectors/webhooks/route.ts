import { NextRequest } from 'next/server';
import { AuthError, requireActiveAuth, requireRole } from '@/lib/server/auth';
import { setTenantContext, withTransaction } from '@/lib/server/db';

export const runtime = 'nodejs';
type Input = { type?: 'typeform' | 'generic_webhook'; name?: string };
export async function POST(request: NextRequest) {
  try {
    const claims = await requireActiveAuth(request); requireRole(claims, 'admin'); const body = await request.json() as Input;
    if (body.type !== 'typeform' && body.type !== 'generic_webhook') return Response.json({ error: 'Webhook type must be typeform or generic_webhook.' }, { status: 400 });
    const connector = await withTransaction(async (client) => { await setTenantContext(client, claims.tenantId); return (await client.query<{ id: string; webhook_secret: string }>(`INSERT INTO connectors (tenant_id, type, status, config) VALUES ($1, $2, 'connected', $3)
      ON CONFLICT (tenant_id, type) DO UPDATE SET status = 'connected', last_error = NULL, config = EXCLUDED.config, updated_at = now() RETURNING id, webhook_secret`, [claims.tenantId, body.type, { name: body.name?.trim() ?? null }])).rows[0]; });
    return Response.json({ connector: { id: connector.id, type: body.type, webhookUrl: new URL(`/api/webhooks/inbound/${claims.tenantId}/${connector.id}`, request.url).toString(), webhookSecret: connector.webhook_secret } }, { status: 201 });
  } catch (error) { if (error instanceof AuthError) return Response.json({ error: error.message }, { status: error.status }); console.error('Create webhook connector failed', error); return Response.json({ error: 'Unable to create webhook connector.' }, { status: 500 }); }
}
