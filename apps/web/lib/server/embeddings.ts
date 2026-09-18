import type { PoolClient } from 'pg';

export type SimilarFeedback = { id: string; raw_text: string; source: string; occurred_at: string | null; similarity: number; score: number };
const pgVector = (values: number[]) => `[${values.join(',')}]`;

/** Caller must set the tenant transaction context before invoking this query. */
export async function findSimilarFeedback(client: PoolClient, tenantId: string, queryEmbedding: number[], limit = 10, threshold = 0.62): Promise<SimilarFeedback[]> {
  if (queryEmbedding.length !== 1536) throw new Error('Expected a 1536-dimensional embedding.');
  const result = await client.query<SimilarFeedback>(`SELECT f.id, f.raw_text, f.source, f.occurred_at, 1 - (e.embedding <=> $2::vector) AS similarity,
      (1 - (e.embedding <=> $2::vector)) + 0.05 * exp(-extract(epoch FROM (now() - COALESCE(f.occurred_at, f.created_at))) / 15552000) AS score
    FROM feedback_embeddings e JOIN feedback_items f ON f.id = e.feedback_item_id
    WHERE e.tenant_id = $1 AND f.tenant_id = $1 AND 1 - (e.embedding <=> $2::vector) >= $3
    ORDER BY score DESC, f.created_at DESC LIMIT $4`, [tenantId, pgVector(queryEmbedding), threshold, Math.min(Math.max(limit, 1), 20)]);
  return result.rows;
}
