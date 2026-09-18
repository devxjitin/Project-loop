import { NextRequest } from 'next/server';
import { AuthError, requireActiveAuth } from '@/lib/server/auth';
import { setTenantContext, withTransaction } from '@/lib/server/db';
export const runtime = 'nodejs';
export async function GET(request: NextRequest, { params }: { params: Promise<{ sessionId: string }> }) {
  try { const claims = await requireActiveAuth(request); const { sessionId } = await params; const messages = await withTransaction(async (client) => { await setTenantContext(client, claims.tenantId); const session = await client.query('SELECT id FROM qa_sessions WHERE id = $1 AND tenant_id = $2 AND user_id = $3', [sessionId, claims.tenantId, claims.sub]); if (!session.rowCount) throw new AuthError(404, 'Q&A session not found.'); return (await client.query('SELECT id, role, content, citations, created_at FROM qa_messages WHERE session_id = $1 AND tenant_id = $2 ORDER BY created_at', [sessionId, claims.tenantId])).rows; }); return Response.json({ sessionId, messages }); } catch (error) { if (error instanceof AuthError) return Response.json({ error: error.message }, { status: error.status }); return Response.json({ error: 'Unable to load Q&A session.' }, { status: 500 }); }
}
