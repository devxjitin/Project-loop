import { NextRequest } from 'next/server';
import { AuthError, requireActiveAuth } from '@/lib/server/auth';
import { setTenantContext, withTransaction } from '@/lib/server/db';
import { embedQuestion, findSimilarFeedback, generateGroundedAnswer } from '@/lib/server/qa';
export const runtime = 'nodejs';
type Input = { question?: string; sessionId?: string };
const noEvidence = "I don't know based on the available feedback.";

export async function POST(request: NextRequest) {
  try {
    const claims = await requireActiveAuth(request); const body = await request.json() as Input; const question = body.question?.trim();
    if (!question || question.length > 2_000) return Response.json({ error: 'Question must be between 1 and 2,000 characters.' }, { status: 400 });
    const embedding = await embedQuestion(question);
    const retrieved = await withTransaction(async (client) => {
      await setTenantContext(client, claims.tenantId); let sessionId = body.sessionId;
      if (sessionId) { const session = await client.query('SELECT id FROM qa_sessions WHERE id = $1 AND tenant_id = $2 AND user_id = $3', [sessionId, claims.tenantId, claims.sub]); if (!session.rowCount) throw new AuthError(404, 'Q&A session not found.'); }
      else sessionId = (await client.query<{ id: string }>('INSERT INTO qa_sessions (tenant_id, user_id) VALUES ($1, $2) RETURNING id', [claims.tenantId, claims.sub])).rows[0].id;
      await client.query("INSERT INTO qa_messages (session_id, tenant_id, role, content) VALUES ($1, $2, 'user', $3)", [sessionId, claims.tenantId, question]);
      return { sessionId, sources: await findSimilarFeedback(client, claims.tenantId, embedding, 8) };
    });
    const generated = retrieved.sources.length ? await generateGroundedAnswer(question, retrieved.sources) : { answer: noEvidence, citations: [] as Array<{ feedback_id: string }> };
    const citations = generated.citations.map(({ feedback_id }) => { const source = retrieved.sources.find((item) => item.id === feedback_id)!; return { feedbackId: source.id, source: source.source, excerpt: source.raw_text.slice(0, 280) }; });
    await withTransaction(async (client) => { await setTenantContext(client, claims.tenantId); await client.query("INSERT INTO qa_messages (session_id, tenant_id, role, content, citations) VALUES ($1, $2, 'assistant', $3, $4::jsonb)", [retrieved.sessionId, claims.tenantId, generated.answer, JSON.stringify(citations)]); await client.query('UPDATE qa_sessions SET updated_at = now() WHERE id = $1', [retrieved.sessionId]); });
    return Response.json({ sessionId: retrieved.sessionId, answer: generated.answer, citations, grounded: retrieved.sources.length > 0 });
  } catch (error) { if (error instanceof AuthError) return Response.json({ error: error.message }, { status: error.status }); console.error('Q&A answer failed', error); return Response.json({ error: 'Unable to produce a grounded answer.' }, { status: 502 }); }
}
