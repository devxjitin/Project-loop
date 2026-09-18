import { NextRequest } from 'next/server';
import { AuthError, requireActiveAuth } from '@/lib/server/auth';
import { setTenantContext, withTransaction } from '@/lib/server/db';
import { embedQuestion, findSimilarFeedback } from '@/lib/server/qa';
export const runtime = 'nodejs';

type Input = { question?: string; sessionId?: string; limit?: number };
export async function POST(request: NextRequest) {
  try {
    const claims = await requireActiveAuth(request); const body = await request.json() as Input;
    const question = body.question?.trim();
    if (!question || question.length > 2_000) return Response.json({ error: 'Question must be between 1 and 2,000 characters.' }, { status: 400 });
    const embedding = await embedQuestion(question);
    const result = await withTransaction(async (client) => {
      await setTenantContext(client, claims.tenantId);
      let sessionId = body.sessionId;
      if (sessionId) {
        const session = await client.query('SELECT id FROM qa_sessions WHERE id = $1 AND tenant_id = $2 AND user_id = $3', [sessionId, claims.tenantId, claims.sub]);
        if (!session.rowCount) throw new AuthError(404, 'Q&A session not found.');
      } else sessionId = (await client.query<{ id: string }>('INSERT INTO qa_sessions (tenant_id, user_id) VALUES ($1, $2) RETURNING id', [claims.tenantId, claims.sub])).rows[0].id;
      await client.query("INSERT INTO qa_messages (session_id, tenant_id, role, content) VALUES ($1, $2, 'user', $3)", [sessionId, claims.tenantId, question]);
      await client.query('UPDATE qa_sessions SET updated_at = now() WHERE id = $1', [sessionId]);
      const sources = await findSimilarFeedback(client, claims.tenantId, embedding, body.limit ?? 8);
      return { sessionId, sources };
    });
    return Response.json({ ...result, grounded: result.sources.length > 0, threshold: 0.62 });
  } catch (error) { if (error instanceof AuthError) return Response.json({ error: error.message }, { status: error.status }); console.error('Q&A retrieval failed', error); return Response.json({ error: 'Unable to retrieve relevant feedback.' }, { status: 502 }); }
}
