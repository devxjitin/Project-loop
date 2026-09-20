"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useSession } from "@/components/auth-session";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { DataLoadError } from "@/components/ui/data-load-error";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import Link from "next/link";
import { useRouter } from "next/navigation";

type Trend = {
  day: string;
  positive_count: number;
  neutral_count: number;
  negative_count: number;
  total_count: number;
};
type Theme = {
  theme_id: string;
  theme_name: string;
  positive_count: number;
  neutral_count: number;
  negative_count: number;
  total_count: number;
};
type Channel = { source: string; total_count: number };
type Status = { total: number; classified: number; embedded: number; themesDone: boolean; processing: boolean };
type Dataset = { id: string; original_filename: string; status: string; row_count: number };
const iso = (offset: number) =>
  new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

export function AnalyticsDashboard() {
  const { token } = useSession();
  const router = useRouter();
  const [from, setFrom] = useState(iso(-29));
  const [to, setTo] = useState(iso(0));
  const [trend, setTrend] = useState<Trend[]>([]);
  const [themes, setThemes] = useState<Theme[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [jobId, setJobId] = useState("");
  const [status, setStatus] = useState<Status | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const loaded = useRef(false);
  const wasProcessing = useRef(false);
  const range = useMemo(
    () => new URLSearchParams(jobId ? { jobId } : { from, to }).toString(),
    [from, to, jobId],
  );
  const load = async (quiet = false) => {
    if (!token) return;
    const headers = { Authorization: `Bearer ${token}` };
    // First load shows skeletons; later refreshes keep the charts on screen with a small spinner.
    if (loaded.current || quiet) setRefreshing(true);
    else setLoading(true);
    try {
      const results = await Promise.all([
        fetch(`/api/analytics/trend?${range}`, { headers }),
        fetch(`/api/analytics/themes?${range}`, { headers }),
        fetch(`/api/analytics/channels?${range}`, { headers }),
      ]);
      const bodies = await Promise.all(results.map((result) => result.json()));
      const failed = results.findIndex((result) => !result.ok);
      if (failed >= 0)
        throw new Error(bodies[failed].error ?? "Unable to load analytics.");
      setTrend(bodies[0].data);
      setThemes(bodies[1].data);
      setChannels(bodies[2].data);
      setMessage("");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to load analytics.",
      );
    } finally {
      loaded.current = true;
      setLoading(false);
      setRefreshing(false);
    }
  };
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  });
  const pollStatus = useCallback(async () => {
    if (!token) return;
    try {
      const response = await fetch(`/api/analytics/status${jobId ? `?jobId=${jobId}` : ""}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) return;
      const next = (await response.json()) as Status;
      setStatus(next);
      // Refresh the charts as results arrive and once more when processing ends.
      if (next.processing || wasProcessing.current) void loadRef.current(true);
      wasProcessing.current = next.processing;
    } catch {
      /* the next poll retries */
    }
  }, [token, jobId]);
  useEffect(() => {
    wasProcessing.current = false;
    void pollStatus();
    const timer = setInterval(() => {
      if (wasProcessing.current) void pollStatus();
    }, 6000);
    return () => clearInterval(timer);
  }, [pollStatus]);
  useEffect(() => {
    void load(); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, jobId]);
  useEffect(() => {
    if (!token) return;
    void fetch("/api/ingestions", { headers: { Authorization: `Bearer ${token}` } })
      .then((response) => (response.ok ? response.json() : { jobs: [] }))
      .then((body: { jobs: Dataset[] }) => setDatasets(body.jobs.filter((job) => job.status === "completed")))
      .catch(() => setDatasets([]));
  }, [token]);
  const totals = useMemo(
    () =>
      trend.reduce(
        (sum, row) => ({
          positive: sum.positive + row.positive_count,
          neutral: sum.neutral + row.neutral_count,
          negative: sum.negative + row.negative_count,
          total: sum.total + row.total_count,
        }),
        { positive: 0, neutral: 0, negative: 0, total: 0 },
      ),
    [trend],
  );
  const drillIntoTheme = (theme: Theme) => {
    router.push(`/feedback?themeId=${encodeURIComponent(theme.theme_id)}`);
  };
  return (
    <section className="w-full max-w-6xl rounded-xl border bg-white p-6 shadow-sm">
      <div>
        <h2 className="text-xl font-semibold">Analytics dashboard</h2>
        <p className="mt-1 text-sm text-slate-600">
          Track sentiment direction, recurring themes, and feedback sources.
        </p>
      </div>
      <div className="mt-5 flex flex-wrap items-end gap-3">
        <label className="text-sm">
          Dataset
          <select
            value={jobId}
            onChange={(event) => setJobId(event.target.value)}
            className="ml-2 rounded-md border px-2 py-1.5"
          >
            <option value="">All files</option>
            {datasets.map((dataset) => (
              <option key={dataset.id} value={dataset.id}>
                {dataset.original_filename} ({dataset.row_count} rows)
              </option>
            ))}
          </select>
        </label>
        {!jobId && (
          <>
        <label className="text-sm">
          From
          <Input
            type="date"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
            className="ml-2 rounded-md border px-2 py-1"
          />
        </label>
        <label className="text-sm">
          To
          <Input
            type="date"
            value={to}
            onChange={(event) => setTo(event.target.value)}
            className="ml-2 rounded-md border px-2 py-1"
          />
        </label>
        <Button onClick={() => void load()} disabled={!token || refreshing}>
          Update dashboard
        </Button>
          </>
        )}
        {jobId && (
          <p className="text-xs text-slate-500">
            Showing every row in this file, regardless of date.
          </p>
        )}
        {refreshing && (
          <span className="inline-flex items-center gap-1.5 text-xs text-slate-500" role="status">
            <Loader2 className="size-3.5 animate-spin" aria-hidden /> Updating…
          </span>
        )}
      </div>
      {status?.processing && <ProcessingPanel status={status} />}
      {message && (
        <DataLoadError message={message} onRetry={() => void load()} />
      )}
      {loading ? (
        <div
          className="mt-6 grid gap-5 lg:grid-cols-2"
          aria-label="Loading analytics"
        >
          <Skeleton className="h-80 lg:col-span-2" />
          <Skeleton className="h-80" />
          <Skeleton className="h-80" />
        </div>
      ) : !trend.length && !message ? (
        <div className="mt-6">
          <EmptyState
            title="Your first insights will appear here"
            description="Connect a feedback source or upload a CSV. LOOP will classify the feedback and build your dashboard automatically."
            action={
              <Link
                href="/upload"
                className="inline-flex rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
              >
                Upload a CSV
              </Link>
            }
          />
        </div>
      ) : (
        !message && (
          <div
            className={`mt-6 grid gap-5 transition-opacity lg:grid-cols-2 ${refreshing ? "opacity-60" : ""}`}
            aria-busy={refreshing}
          >
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:col-span-2">
              {[
                { label: "Total", value: totals.total, tone: "text-slate-900" },
                { label: "Positive", value: totals.positive, tone: "text-emerald-600" },
                { label: "Neutral", value: totals.neutral, tone: "text-slate-500" },
                { label: "Negative", value: totals.negative, tone: "text-rose-600" },
              ].map((card) => (
                <div key={card.label} className="rounded-lg border p-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    {card.label}
                  </p>
                  <p className={`mt-1 text-2xl font-semibold ${card.tone}`}>{card.value}</p>
                  {card.label !== "Total" && totals.total > 0 && (
                    <p className="text-xs text-slate-500">
                      {Math.round((card.value / totals.total) * 100)}%
                    </p>
                  )}
                </div>
              ))}
            </div>
            <article className="rounded-lg border p-4 lg:col-span-2">
              <h3 className="font-medium">Sentiment trend</h3>
              <div className="mt-4 h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trend}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="day"
                      tickFormatter={(value) => String(value).slice(5)}
                    />
                    <YAxis allowDecimals={false} />
                    <Tooltip labelFormatter={(value) => `Date: ${value}`} />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="positive_count"
                      name="Positive"
                      stroke="#059669"
                    />
                    <Line
                      type="monotone"
                      dataKey="neutral_count"
                      name="Neutral"
                      stroke="#64748b"
                    />
                    <Line
                      type="monotone"
                      dataKey="negative_count"
                      name="Negative"
                      stroke="#e11d48"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </article>
            <article className="rounded-lg border p-4">
              <h3 className="font-medium">Top themes</h3>
              <p className="mt-1 text-xs text-slate-500">
                Click a bar to open the filtered inbox.
              </p>
              <div className="mt-4 h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={themes}
                    layout="vertical"
                    onClick={(state) => {
                      const theme = (
                        state as unknown as
                          | { activePayload?: Array<{ payload: Theme }> }
                          | undefined
                      )?.activePayload?.[0]?.payload;
                      if (theme) drillIntoTheme(theme);
                    }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" allowDecimals={false} />
                    <YAxis type="category" dataKey="theme_name" width={120} />
                    <Tooltip />
                    <Legend />
                    <Bar
                      dataKey="positive_count"
                      name="Positive"
                      stackId="sentiment"
                      fill="#059669"
                    />
                    <Bar
                      dataKey="neutral_count"
                      name="Neutral"
                      stackId="sentiment"
                      fill="#64748b"
                    />
                    <Bar
                      dataKey="negative_count"
                      name="Negative"
                      stackId="sentiment"
                      fill="#e11d48"
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </article>
            <article className="rounded-lg border p-4">
              <h3 className="font-medium">Feedback volume by channel</h3>
              <div className="mt-4 h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={channels}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="source" />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="total_count" name="Feedback" fill="#4f46e5" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </article>
          </div>
        )
      )}
    </section>
  );
}

function ProcessingPanel({ status }: { status: Status }) {
  const pct = (done: number) => (status.total ? Math.round((done / status.total) * 100) : 100);
  const steps = [
    { label: "Reading sentiment", done: status.classified, complete: status.classified >= status.total, counted: true },
    { label: "Understanding meaning", done: status.embedded, complete: status.embedded >= status.total, counted: true },
    { label: "Grouping themes", done: 0, complete: status.themesDone, counted: false },
  ];
  return (
    <div className="mt-6 rounded-lg border border-blue-200 bg-blue-50 p-4" role="status" aria-live="polite">
      <p className="flex items-center gap-2 text-sm font-medium text-blue-900">
        <Loader2 className="size-4 animate-spin" aria-hidden /> Analysing your feedback. Results appear below as they are ready.
      </p>
      <ul className="mt-3 grid gap-3 sm:grid-cols-3">
        {steps.map((step) => (
          <li key={step.label} className="text-xs text-blue-900">
            <span className="flex items-center gap-1.5 font-medium">
              {step.complete ? (
                <CheckCircle2 className="size-3.5 text-emerald-600" aria-hidden />
              ) : (
                <Loader2 className="size-3.5 animate-spin" aria-hidden />
              )}
              {step.label}
              {step.counted && (
                <span className="ml-auto tabular-nums">
                  {step.done}/{status.total}
                </span>
              )}
            </span>
            <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-blue-100">
              <span
                className={`block h-full rounded-full bg-blue-600 transition-all ${step.counted || step.complete ? "" : "animate-pulse"}`}
                style={{ width: `${step.counted ? pct(step.done) : step.complete ? 100 : 30}%` }}
              />
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
