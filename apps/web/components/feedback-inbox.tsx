"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { useSession } from "@/components/auth-session";
import { Button } from "@/components/ui/button";
import { SentimentBadge, type Sentiment } from "@/components/sentiment-badge";
import { ThemeTag } from "@/components/theme-tag";
import { EmptyState } from "@/components/ui/empty-state";
import { DataLoadError } from "@/components/ui/data-load-error";
import { Skeleton } from "@/components/ui/skeleton";
import Link from "next/link";

type Theme = { id: string; name: string };
type Feedback = {
  id: string;
  source: string;
  raw_text: string;
  author: string | null;
  source_url: string | null;
  occurred_at: string | null;
  sentiment: Sentiment | null;
  created_at: string;
  themes: Theme[];
};

export function FeedbackInbox() {
  const { token } = useSession();
  const searchParams = useSearchParams();
  const [items, setItems] = useState<Feedback[]>([]);
  const [themes, setThemes] = useState<Theme[]>([]);
  const [selected, setSelected] = useState<Feedback | null>(null);
  const [query, setQuery] = useState("");
  const [source, setSource] = useState("");
  const [sentiment, setSentiment] = useState("");
  const [themeId, setThemeId] = useState(
    () => searchParams.get("themeId") ?? "",
  );
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const load = async (themeOverride = themeId) => {
    if (!token) return;
    const params = new URLSearchParams({ limit: "50" });
    if (query) params.set("q", query);
    if (source) params.set("source", source);
    if (sentiment) params.set("sentiment", sentiment);
    if (themeOverride) params.set("themeId", themeOverride);
    setLoading(true);
    try {
      const response = await fetch(`/api/feedback?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error ?? "Unable to load feedback.");
      setItems(body.items);
      setMessage("");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to load feedback.",
      );
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    if (!token) return;
    void load();
    void fetch("/api/themes", { headers: { Authorization: `Bearer ${token}` } })
      .then((response) => response.json())
      .then((body) => {
        if (body.themes) setThemes(body.themes);
      }); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);
  return (
    <section className="w-full max-w-6xl rounded-xl border bg-white p-6 shadow-sm">
      <div>
        <h2 className="text-xl font-semibold">Feedback inbox</h2>
        <p className="mt-1 text-sm text-slate-600">
          Search customer feedback across every connected channel.
        </p>
      </div>
      <div className="mt-5 grid gap-3 md:grid-cols-4">
        <label className="relative">
          <Search
            aria-hidden
            className="absolute left-3 top-2.5 size-4 text-slate-400"
          />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search feedback"
            className="w-full rounded-md border py-2 pl-9 pr-3 text-sm"
          />
        </label>
        <select
          aria-label="Source"
          value={source}
          onChange={(event) => setSource(event.target.value)}
          className="rounded-md border px-3 py-2 text-sm"
        >
          <option value="">All channels</option>
          <option value="zendesk">Zendesk</option>
          <option value="typeform">Typeform</option>
          <option value="generic_webhook">Webhook</option>
        </select>
        <select
          aria-label="Sentiment"
          value={sentiment}
          onChange={(event) => setSentiment(event.target.value)}
          className="rounded-md border px-3 py-2 text-sm"
        >
          <option value="">All sentiment</option>
          <option value="positive">Positive</option>
          <option value="neutral">Neutral</option>
          <option value="negative">Negative</option>
        </select>
        <select
          aria-label="Theme"
          value={themeId}
          onChange={(event) => setThemeId(event.target.value)}
          className="rounded-md border px-3 py-2 text-sm"
        >
          <option value="">All themes</option>
          {themes.map((theme) => (
            <option key={theme.id} value={theme.id}>
              {theme.name}
            </option>
          ))}
        </select>
      </div>
      <div className="mt-3 flex gap-2">
        <Button onClick={() => void load()} disabled={!token}>
          Apply filters
        </Button>
        <Button
          onClick={() => {
            setQuery("");
            setSource("");
            setSentiment("");
            setThemeId("");
          }}
        >
          Reset
        </Button>
      </div>
      {message && (
        <DataLoadError message={message} onRetry={() => void load()} />
      )}
      {loading ? (
        <div className="mt-5 space-y-3" aria-label="Loading feedback">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : !items.length && !message ? (
        <div className="mt-5">
          <EmptyState
            title="No feedback yet"
            description="Connect a source or upload a CSV to start seeing customer feedback here."
            action={
              <Link
                href="/connectors"
                className="inline-flex rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
              >
                Connect a source
              </Link>
            }
          />
        </div>
      ) : (
        !message && (
          <div className="mt-5 grid gap-5 lg:grid-cols-[1.5fr_1fr]">
            <div className="overflow-hidden rounded-lg border">
              <div className="max-h-[580px] divide-y overflow-y-auto">
                {items.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setSelected(item)}
                    className="w-full p-4 text-left hover:bg-slate-50"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
                        {item.source}
                      </span>
                      {item.sentiment && (
                        <SentimentBadge sentiment={item.sentiment} />
                      )}
                    </div>
                    <p className="mt-2 line-clamp-2 text-sm">{item.raw_text}</p>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {item.themes.map((theme) => (
                        <ThemeTag
                          key={theme.id}
                          name={theme.name}
                          onClick={() => {
                            setThemeId(theme.id);
                            void load(theme.id);
                          }}
                        />
                      ))}
                    </div>
                  </button>
                ))}
              </div>
            </div>
            <aside className="min-h-48 rounded-lg border bg-slate-50 p-5">
              {selected ? (
                <>
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    {selected.source}
                  </p>
                  <p className="mt-4 whitespace-pre-wrap text-sm leading-6">
                    {selected.raw_text}
                  </p>
                  <p className="mt-5 text-xs text-slate-600">
                    {selected.author ?? "Unknown"} ·{" "}
                    {new Date(
                      selected.occurred_at ?? selected.created_at,
                    ).toLocaleString()}
                  </p>
                  {selected.source_url && (
                    <a
                      className="mt-3 block text-sm font-medium text-indigo-700 underline"
                      href={selected.source_url}
                      target="_blank"
                    >
                      Open original source
                    </a>
                  )}
                </>
              ) : (
                <p className="text-sm text-slate-500">
                  Select a feedback item to view its full detail and original
                  source.
                </p>
              )}
            </aside>
          </div>
        )
      )}
    </section>
  );
}
