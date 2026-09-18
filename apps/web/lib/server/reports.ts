import type { PoolClient } from 'pg';
import { redactForModel } from '@/lib/server/pii';

export type ReportSnapshot = { metrics: { total: number; positive: number; neutral: number; negative: number; previousTotal: number; previousNegative: number }; topThemes: Array<{ name: string; total: number; positive: number; neutral: number; negative: number }>; quotes: Array<{ id: string; text: string; source: string; sentiment: string | null }> };
export async function reportSnapshot(client: PoolClient, tenantId: string, from: string, to: string): Promise<ReportSnapshot> {
  const previousEnd = new Date(`${from}T00:00:00Z`); previousEnd.setUTCDate(previousEnd.getUTCDate() - 1); const days = Math.max(1, Math.round((new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / 86_400_000) + 1); const previousStart = new Date(previousEnd); previousStart.setUTCDate(previousStart.getUTCDate() - days + 1);
  const [metrics, themes, quotes] = await Promise.all([
    client.query<{ total: number; positive: number; neutral: number; negative: number }>(`SELECT COALESCE(sum(total_count), 0)::integer AS total, COALESCE(sum(positive_count), 0)::integer AS positive, COALESCE(sum(neutral_count), 0)::integer AS neutral, COALESCE(sum(negative_count), 0)::integer AS negative FROM tenant_analytics_sentiment_daily WHERE tenant_id = $1 AND day BETWEEN $2::date AND $3::date`, [tenantId, from, to]),
    client.query<{ name: string; total: number; positive: number; neutral: number; negative: number }>(`SELECT theme_name AS name, sum(total_count)::integer AS total, sum(positive_count)::integer AS positive, sum(neutral_count)::integer AS neutral, sum(negative_count)::integer AS negative FROM tenant_analytics_theme_counts WHERE tenant_id = $1 AND day BETWEEN $2::date AND $3::date GROUP BY theme_name ORDER BY total DESC, name LIMIT 8`, [tenantId, from, to]),
    client.query<{ id: string; text: string; source: string; sentiment: string | null }>(`SELECT id, left(raw_text, 800) AS text, source, sentiment FROM feedback_items WHERE tenant_id = $1 AND coalesce(occurred_at, created_at)::date BETWEEN $2::date AND $3::date ORDER BY CASE sentiment WHEN 'negative' THEN 0 WHEN 'positive' THEN 1 ELSE 2 END, created_at DESC LIMIT 6`, [tenantId, from, to]),
  ]);
  const previous = await client.query<{ total: number; negative: number }>(`SELECT COALESCE(sum(total_count), 0)::integer AS total, COALESCE(sum(negative_count), 0)::integer AS negative FROM tenant_analytics_sentiment_daily WHERE tenant_id = $1 AND day BETWEEN $2::date AND $3::date`, [tenantId, previousStart.toISOString().slice(0, 10), previousEnd.toISOString().slice(0, 10)]);
  return { metrics: { ...metrics.rows[0], previousTotal: previous.rows[0].total, previousNegative: previous.rows[0].negative }, topThemes: themes.rows, quotes: quotes.rows };
}
export async function summarizeReport(periodStart: string, periodEnd: string, snapshot: ReportSnapshot) {
  const response = await fetch(`${process.env.AI_SERVICE_URL ?? 'http://ai-service:8000'}/v1/reports/summarize`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-internal-token': process.env.AI_SERVICE_TOKEN ?? '' }, body: JSON.stringify({ period_start: periodStart, period_end: periodEnd, metrics: snapshot.metrics, top_themes: snapshot.topThemes, notable_quotes: snapshot.quotes.map((quote) => ({ ...quote, text: redactForModel(quote.text) })) }) });
  if (!response.ok) throw new Error(`Report summary failed (${response.status}).`); const body = await response.json() as { content?: string }; if (!body.content) throw new Error('Report service returned no content.'); return body.content;
}
/** Worker-only generation path. The caller supplies the privileged scheduled-worker client. */
export async function generateScheduledReport(client: PoolClient, tenantId: string, from: string, to: string) {
  const snapshot = await reportSnapshot(client, tenantId, from, to);
  const created = await client.query<{ id: string }>("INSERT INTO reports (tenant_id, period_start, period_end, status, snapshot) VALUES ($1, $2, $3, 'generating', $4::jsonb) RETURNING id", [tenantId, from, to, JSON.stringify(snapshot)]);
  try { const content = await summarizeReport(from, to, snapshot); await client.query("UPDATE reports SET status = 'ready', content = $2, generated_at = now() WHERE id = $1", [created.rows[0].id, content]); return created.rows[0].id; }
  catch (error) { await client.query("UPDATE reports SET status = 'failed' WHERE id = $1", [created.rows[0].id]); throw error; }
}
