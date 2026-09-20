import { findSimilarFeedback } from '@/lib/server/embeddings';
import { redactForModel } from '@/lib/server/pii';

export async function embedQuestion(question: string) {
  const response = await fetch(`${process.env.AI_SERVICE_URL ?? 'http://ai-service:8000'}/v1/embeddings/query`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-internal-token': process.env.AI_SERVICE_TOKEN ?? '' }, body: JSON.stringify({ items: [{ id: 'question', text: question }] }) });
  if (!response.ok) throw new Error(`Question embedding failed (${response.status}).`);
  const body = await response.json() as { embeddings?: Array<{ id: string; embedding: number[] }> };
  const embedding = body.embeddings?.[0]?.embedding;
  if (!embedding || embedding.length !== 1536) throw new Error('Question embedding service returned an invalid vector.');
  return embedding;
}
export type QaSource = { id: string; raw_text: string; source: string; occurred_at: string | null; similarity: number; score: number };
export async function generateGroundedAnswer(question: string, sources: QaSource[]) {
  const response = await fetch(`${process.env.AI_SERVICE_URL ?? 'http://ai-service:8000'}/v1/qa/answer`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-internal-token': process.env.AI_SERVICE_TOKEN ?? '' }, body: JSON.stringify({ question: redactForModel(question), sources: sources.map(({ id, raw_text, source, occurred_at }) => ({ id, text: redactForModel(raw_text), source, occurred_at })) }) });
  if (!response.ok) throw new Error(`Grounded answer generation failed (${response.status}).`);
  const body = await response.json() as { answer?: string; citations?: Array<{ feedback_id: string }> };
  const citations = body.citations ?? [];
  if (!body.answer || (!citations.length && body.answer.trim() !== "I don't know based on the available feedback.")) throw new Error('Answer service returned an invalid response.');
  const permitted = new Set(sources.map((source) => source.id));
  if (citations.some((citation) => !permitted.has(citation.feedback_id))) throw new Error('Answer contains an ungrounded citation.');
  return { answer: body.answer, citations };
}
export { findSimilarFeedback };
