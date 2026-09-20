"use client";
import { FormEvent, useEffect, useState } from "react";
import { useSession } from "@/components/auth-session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
type Citation = { feedbackId: string; source: string; excerpt: string };
type Message = {
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
};
const marker = /\s*\[source:[^\]]+\]/g;
export function QaChat() {
  const { token } = useSession();
  const [question, setQuestion] = useState("");
  const [sessionId, setSessionId] = useState<string>();
  const [messages, setMessages] = useState<Message[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  // Wake the AI service (free hosting suspends it when idle) while the user is still typing the first question.
  useEffect(() => {
    if (token) void fetch("/api/qa/warm", { headers: { Authorization: `Bearer ${token}` } }).catch(() => undefined);
  }, [token]);
  const ask = async (event: FormEvent) => {
    event.preventDefault();
    const text = question.trim();
    if (!text || !token || loading) return;
    setQuestion("");
    setError("");
    setLoading(true);
    setMessages((items) => [...items, { role: "user", content: text }]);
    try {
      const response = await fetch("/api/qa/answer", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ question: text, sessionId }),
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error ?? "Unable to answer question.");
      setSessionId(body.sessionId);
      setMessages((items) => [
        ...items,
        { role: "assistant", content: body.answer, citations: body.citations },
      ]);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to answer question.",
      );
    } finally {
      setLoading(false);
    }
  };
  return (
    <section className="w-full max-w-4xl rounded-xl border bg-white p-6 shadow-sm">
      <div>
        <h2 className="text-xl font-semibold">Ask LOOP</h2>
        <p className="mt-1 text-sm text-slate-600">
          Answers are grounded only in your feedback. Each source opens its
          feedback detail.
        </p>
      </div>
      <div className="mt-5 max-h-[520px] space-y-4 overflow-y-auto">
        {messages.length === 0 && (
          <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-500">
            Ask about customer pain points, sentiment, or recurring requests.
          </p>
        )}
        {messages.map((message, index) => (
          <article
            key={index}
            className={`rounded-lg p-4 text-sm ${message.role === "user" ? "ml-8 bg-indigo-50" : "mr-8 bg-slate-50"}`}
          >
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
              {message.role === "user" ? "You" : "LOOP"}
            </p>
            <p className="whitespace-pre-wrap leading-6">
              {message.content.replace(marker, "")}
            </p>
            {message.citations?.length ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {message.citations.map((citation) => (
                  <a
                    key={citation.feedbackId}
                    href={`/feedback?feedbackId=${encodeURIComponent(citation.feedbackId)}`}
                    title={citation.excerpt}
                    className="rounded-full border border-indigo-200 bg-white px-2 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-50"
                  >
                    Source: {citation.source}
                  </a>
                ))}
              </div>
            ) : null}
          </article>
        ))}
        {loading && (
          <p className="text-sm text-slate-500">
            Checking relevant feedback...
          </p>
        )}
      </div>
      {error && (
        <p role="alert" className="mt-3 text-sm text-red-700">
          {error}
        </p>
      )}
      <form onSubmit={ask} className="mt-5 flex gap-2">
        <Input
          aria-label="Question"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder="What are customers saying about onboarding?"
          className="min-w-0 flex-1 rounded-md border px-3 py-2 text-sm"
          disabled={!token || loading}
        />
        <Button type="submit" disabled={!token || !question.trim() || loading}>
          Ask
        </Button>
      </form>
      {!token && (
        <p className="mt-2 text-xs text-slate-500">
          Paste an access token in the workspace session above to ask a
          question.
        </p>
      )}
    </section>
  );
}
