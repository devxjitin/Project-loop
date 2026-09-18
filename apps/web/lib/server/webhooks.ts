import { createHmac, timingSafeEqual } from 'node:crypto';
import type { PoolClient } from 'pg';

type TypeformAnswer = { type?: string; text?: string; email?: string; url?: string; number?: number; field?: { id?: string; ref?: string } };
export type TypeformPayload = { form_response?: { token?: string; form_id?: string; submitted_at?: string; hidden?: Record<string, string>; answers?: TypeformAnswer[]; definition?: { fields?: Array<{ id?: string; ref?: string; title?: string }> } } };

export function verifyWebhookSignature(rawBody: string, signature: string | null, secret: string) {
  if (!signature) return false;
  const expected = createHmac('sha256', secret).update(rawBody).digest('base64');
  const received = signature.replace(/^sha256=/i, '');
  const left = Buffer.from(expected); const right = Buffer.from(received);
  return left.length === right.length && timingSafeEqual(left, right);
}

function answerText(answer: TypeformAnswer) {
  if (answer.type !== 'text' && answer.type !== 'email' && answer.type !== 'url') return null;
  return answer.text ?? answer.email ?? answer.url ?? null;
}

/** One Typeform submission becomes one feedback item for every free-text response. */
export async function ingestTypeformPayload(client: PoolClient, tenantId: string, payload: TypeformPayload) {
  const response = payload.form_response;
  if (!response?.token) return 0;
  let imported = 0;
  for (const answer of response.answers ?? []) {
    const text = answerText(answer)?.trim(); if (!text) continue;
    const fieldKey = answer.field?.id ?? answer.field?.ref; if (!fieldKey) continue;
    const externalId = `${response.token}:${fieldKey}`;
    await client.query(`INSERT INTO feedback_items (tenant_id, source, external_id, raw_text, author, occurred_at)
      VALUES ($1, 'typeform', $2, $3, $4, $5)
      ON CONFLICT (tenant_id, source, external_id) DO UPDATE SET raw_text = EXCLUDED.raw_text, author = EXCLUDED.author, occurred_at = EXCLUDED.occurred_at, updated_at = now()`,
      [tenantId, externalId, text, response.hidden?.email ?? response.hidden?.name ?? null, response.submitted_at ?? null]);
    imported++;
  }
  return imported;
}

export async function ingestGenericPayload(client: PoolClient, tenantId: string, payload: unknown) {
  const item = payload as { text?: unknown; rawText?: unknown; author?: unknown; externalId?: unknown; occurredAt?: unknown; sourceUrl?: unknown };
  const text = typeof item.text === 'string' ? item.text.trim() : typeof item.rawText === 'string' ? item.rawText.trim() : '';
  if (!text) return 0;
  const externalId = typeof item.externalId === 'string' ? item.externalId : createHmac('sha256', String(tenantId)).update(JSON.stringify(payload)).digest('hex');
  await client.query(`INSERT INTO feedback_items (tenant_id, source, external_id, raw_text, author, source_url, occurred_at)
    VALUES ($1, 'generic_webhook', $2, $3, $4, $5, $6)
    ON CONFLICT (tenant_id, source, external_id) DO UPDATE SET raw_text = EXCLUDED.raw_text, author = EXCLUDED.author, source_url = EXCLUDED.source_url, occurred_at = EXCLUDED.occurred_at, updated_at = now()`,
    [tenantId, externalId, text, typeof item.author === 'string' ? item.author : null, typeof item.sourceUrl === 'string' ? item.sourceUrl : null, typeof item.occurredAt === 'string' ? item.occurredAt : null]);
  return 1;
}
