"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CheckCircle2, Loader2 } from "lucide-react";
import { useSession } from "@/components/auth-session";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { DataLoadError } from "@/components/ui/data-load-error";
import { Skeleton } from "@/components/ui/skeleton";
import Link from "next/link";
import { useRouter } from "next/navigation";

type Counts = {
  positive_count: number;
  neutral_count: number;
  negative_count: number;
  total_count: number;
};
type Trend = Counts & { day: string };
type Theme = Counts & { theme_id: string; theme_name: string };
type FileRow = Counts & { file_id: string | null; file_name: string };
type Keyword = Counts & { word: string };
type Status = {
  total: number;
  classified: number;
  embedded: number;
  themesDone: boolean;
  processing: boolean;
};
type Dataset = {
  id: string;
  original_filename: string;
  status: string;
  row_count: number;
};

const COLORS = { positive: "#059669", neutral: "#94a3b8", negative: "#e11d48" };
const shorten = (value: string, max = 24) =>
  value.length > max ? `${value.slice(0, max - 1)}…` : value;
const percent = (part: number, whole: number) =>
  whole ? Math.round((part / whole) * 100) : 0;

export function AnalyticsDashboard() {
  const { token } = useSession();
  const router = useRouter();
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [jobId, setJobId] = useState("");
  const [trend, setTrend] = useState<Trend[]>([]);
  const [themes, setThemes] = useState<Theme[]>([]);
  const [files, setFiles] = useState<FileRow[]>([]);
  const [keywords, setKeywords] = useState<Keyword[]>([]);
  const [status, setStatus] = useState<Status | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stalled, setStalled] = useState(false);
  const progress = useRef({ key: "", since: 0 });
  const loaded = useRef(false);
  const wasProcessing = useRef(false);
  const query = useMemo(() => (jobId ? `?jobId=${jobId}` : ""), [jobId]);

  const load = async (quiet = false) => {
    if (!token) return;
    const headers = { Authorization: `Bearer ${token}` };
    // First load shows skeletons; later refreshes keep the charts on screen with a small spinner.
    if (loaded.current || quiet) setRefreshing(true);
    else setLoading(true);
    try {
      const results = await Promise.all([
        fetch(`/api/analytics/trend${query}`, { headers }),
        fetch(
          `/api/analytics/themes${query}${query ? "&" : "?"}limit=12`,
          { headers },
        ),
        fetch(`/api/analytics/files${query}`, { headers }),
        fetch(`/api/analytics/keywords${query}`, { headers }),
      ]);
      const bodies = await Promise.all(results.map((result) => result.json()));
      const failed = results.findIndex((result) => !result.ok);
      if (failed >= 0)
        throw new Error(bodies[failed].error ?? "Unable to load analytics.");
      setTrend(bodies[0].data);
      setThemes(bodies[1].data);
      setFiles(bodies[2].data);
      setKeywords(bodies[3].data);
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
  useEffect(() => {
    void load(); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, jobId]);
  useEffect(() => {
    if (!token) return;
    void fetch("/api/ingestions", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((response) => (response.ok ? response.json() : { jobs: [] }))
      .then((body: { jobs: Dataset[] }) =>
        setDatasets(body.jobs.filter((job) => job.status === "completed")),
      )
      .catch(() => setDatasets([]));
  }, [token]);

  const pollStatus = useCallback(async () => {
    if (!token) return;
    try {
      const response = await fetch(`/api/analytics/status${query}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) return;
      const next = (await response.json()) as Status;
      setStatus(next);
      // No movement for a while usually means a free-tier service is waking up.
      const key = `${next.classified}/${next.embedded}/${next.themesDone}`;
      if (key !== progress.current.key) progress.current = { key, since: Date.now() };
      setStalled(next.processing && Date.now() - progress.current.since > 45_000);
      // Refresh the charts as results arrive and once more when processing ends.
      if (next.processing || wasProcessing.current) void loadRef.current(true);
      wasProcessing.current = next.processing;
    } catch {
      /* the next poll retries */
    }
  }, [token, query]);
  useEffect(() => {
    wasProcessing.current = false;
    void pollStatus();
    const timer = setInterval(() => {
      if (wasProcessing.current) void pollStatus();
    }, 6000);
    return () => clearInterval(timer);
  }, [pollStatus]);

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
  const score = totals.total
    ? Math.round(((totals.positive - totals.negative) / totals.total) * 100)
    : 0;
  const scoreLabel =
    score >= 30 ? "Mostly positive" : score <= -30 ? "Mostly negative" : "Mixed";
  const donut = [
    { name: "Positive", value: totals.positive, color: COLORS.positive },
    { name: "Neutral", value: totals.neutral, color: COLORS.neutral },
    { name: "Negative", value: totals.negative, color: COLORS.negative },
  ].filter((slice) => slice.value > 0);
  const painPoints = useMemo(
    () =>
      themes
        .filter((theme) => theme.negative_count > 0)
        .sort((a, b) => b.negative_count - a.negative_count)
        .slice(0, 5),
    [themes],
  );
  const strengths = useMemo(
    () =>
      themes
        .filter((theme) => theme.positive_count > 0)
        .sort((a, b) => b.positive_count - a.positive_count)
        .slice(0, 5),
    [themes],
  );
  const showFiles = !jobId && files.length > 1;
  const openTheme = (theme: Theme) =>
    router.push(`/feedback?themeId=${encodeURIComponent(theme.theme_id)}`);

  return (
    <section className="w-full max-w-6xl rounded-xl border bg-white p-6 shadow-sm">
      <div>
        <h2 className="text-xl font-semibold">Analytics dashboard</h2>
        <p className="mt-1 text-sm text-slate-600">
          Quick insight from your uploaded files: sentiment, themes and the
          words customers use most.
        </p>
      </div>
      <div className="mt-5 flex flex-wrap items-end gap-3">
        <label className="text-sm">
          File
          <select
            value={jobId}
            onChange={(event) => setJobId(event.target.value)}
            className="ml-2 max-w-xs rounded-md border px-2 py-1.5"
          >
            <option value="">All files</option>
            {datasets.map((dataset) => (
              <option key={dataset.id} value={dataset.id}>
                {dataset.original_filename} ({dataset.row_count} rows)
              </option>
            ))}
          </select>
        </label>
        <Button
          variant="secondary"
          onClick={() => {
            void load(true);
            void pollStatus();
          }}
          disabled={!token || refreshing}
        >
          Refresh
        </Button>
        {refreshing && (
          <span
            className="inline-flex items-center gap-1.5 text-xs text-slate-500"
            role="status"
          >
            <Loader2 className="size-3.5 animate-spin" aria-hidden /> Updating…
          </span>
        )}
      </div>
      {status?.processing && <ProcessingPanel status={status} stalled={stalled} />}
      {message && (
        <DataLoadError message={message} onRetry={() => void load()} />
      )}
      {loading ? (
        <div
          className="mt-6 grid gap-5 lg:grid-cols-2"
          aria-label="Loading analytics"
        >
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5 lg:col-span-2">
            {[0, 1, 2, 3, 4].map((key) => (
              <Skeleton key={key} className="h-24" />
            ))}
          </div>
          <Skeleton className="h-80" />
          <Skeleton className="h-80" />
          <Skeleton className="h-80 lg:col-span-2" />
        </div>
      ) : !totals.total && !message ? (
        <div className="mt-6">
          {status?.processing ? null : (
            <EmptyState
              title="Your first insights will appear here"
              description="Upload a CSV. LOOP will classify the feedback and build your dashboard automatically."
              action={
                <Link
                  href="/upload"
                  className="inline-flex rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
                >
                  Upload a CSV
                </Link>
              }
            />
          )}
        </div>
      ) : (
        !message && (
          <div
            className={`mt-6 grid gap-5 transition-opacity lg:grid-cols-2 ${refreshing ? "opacity-60" : ""}`}
            aria-busy={refreshing}
          >
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5 lg:col-span-2">
              <Kpi label="Total feedback" value={totals.total} />
              <Kpi
                label="Positive"
                value={totals.positive}
                sub={`${percent(totals.positive, totals.total)}%`}
                tone="text-emerald-600"
              />
              <Kpi
                label="Neutral"
                value={totals.neutral}
                sub={`${percent(totals.neutral, totals.total)}%`}
                tone="text-slate-500"
              />
              <Kpi
                label="Negative"
                value={totals.negative}
                sub={`${percent(totals.negative, totals.total)}%`}
                tone="text-rose-600"
              />
              <Kpi
                label="Net sentiment"
                value={`${score > 0 ? "+" : ""}${score}`}
                sub={scoreLabel}
                tone={
                  score >= 30
                    ? "text-emerald-600"
                    : score <= -30
                      ? "text-rose-600"
                      : "text-amber-600"
                }
              />
            </div>

            <Card title="Sentiment split">
              <div className="relative h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={donut}
                      dataKey="value"
                      nameKey="name"
                      innerRadius="58%"
                      outerRadius="85%"
                      paddingAngle={2}
                    >
                      {donut.map((slice) => (
                        <Cell key={slice.name} fill={slice.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center pb-6">
                  <span className="text-3xl font-semibold">{totals.total}</span>
                  <span className="text-xs text-slate-500">items</span>
                </div>
              </div>
            </Card>

            {showFiles ? (
              <Card
                title="Sentiment by file"
                hint="Compare uploaded files side by side."
              >
                <div style={{ height: Math.max(240, files.length * 52 + 60) }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={files}
                      layout="vertical"
                      margin={{ left: 8, right: 16 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                      <XAxis type="number" allowDecimals={false} />
                      <YAxis
                        type="category"
                        dataKey="file_name"
                        width={150}
                        tick={{ fontSize: 12 }}
                        tickFormatter={(value: string) => shorten(value, 22)}
                      />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="positive_count" name="Positive" stackId="s" fill={COLORS.positive} />
                      <Bar dataKey="neutral_count" name="Neutral" stackId="s" fill={COLORS.neutral} />
                      <Bar dataKey="negative_count" name="Negative" stackId="s" fill={COLORS.negative} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Card>
            ) : (
              <KeywordCard keywords={keywords} />
            )}

            <Card
              title="Top themes"
              hint="Click a theme to open its feedback."
              className="lg:col-span-2"
            >
              {themes.length ? (
                <ThemeBars themes={themes} onOpen={openTheme} />
              ) : (
                <p className="py-8 text-center text-sm text-slate-500">
                  {status?.processing
                    ? "Themes appear once analysis finishes."
                    : "Themes need at least 3 feedback items to form."}
                </p>
              )}
            </Card>

            <Card title="Biggest pain points" hint="Themes with the most negative feedback.">
              <RankList
                rows={painPoints}
                value={(theme) => theme.negative_count}
                tone="bg-rose-500"
                empty="No negative themes."
                onOpen={openTheme}
              />
            </Card>
            <Card title="Biggest strengths" hint="Themes with the most positive feedback.">
              <RankList
                rows={strengths}
                value={(theme) => theme.positive_count}
                tone="bg-emerald-500"
                empty="No positive themes."
                onOpen={openTheme}
              />
            </Card>

            {showFiles && <KeywordCard keywords={keywords} className="lg:col-span-2" />}

            {trend.length > 1 && (
              <Card
                title="Sentiment over time"
                hint="Shown when your feedback spans more than one day."
                className="lg:col-span-2"
              >
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={trend}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="day" tickFormatter={(value) => String(value).slice(5)} />
                      <YAxis allowDecimals={false} />
                      <Tooltip labelFormatter={(value) => `Date: ${value}`} />
                      <Legend />
                      <Area type="monotone" dataKey="positive_count" name="Positive" stackId="t" stroke={COLORS.positive} fill={COLORS.positive} fillOpacity={0.6} />
                      <Area type="monotone" dataKey="neutral_count" name="Neutral" stackId="t" stroke={COLORS.neutral} fill={COLORS.neutral} fillOpacity={0.6} />
                      <Area type="monotone" dataKey="negative_count" name="Negative" stackId="t" stroke={COLORS.negative} fill={COLORS.negative} fillOpacity={0.6} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </Card>
            )}
          </div>
        )
      )}
    </section>
  );
}

function Card({
  title,
  hint,
  className = "",
  children,
}: {
  title: string;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <article className={`rounded-lg border p-4 ${className}`}>
      <h3 className="font-medium">{title}</h3>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
      <div className="mt-4">{children}</div>
    </article>
  );
}

function Kpi({
  label,
  value,
  sub,
  tone = "text-slate-900",
}: {
  label: string;
  value: number | string;
  sub?: string;
  tone?: string;
}) {
  return (
    <div className="rounded-lg border p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className={`mt-1 text-2xl font-semibold ${tone}`}>{value}</p>
      <p className="h-4 text-xs text-slate-500">{sub}</p>
    </div>
  );
}

/** Horizontal stacked bars in plain HTML so long theme names wrap instead of overlapping. */
function ThemeBars({
  themes,
  onOpen,
}: {
  themes: Theme[];
  onOpen: (theme: Theme) => void;
}) {
  const max = Math.max(...themes.map((theme) => theme.total_count), 1);
  return (
    <ul className="space-y-3">
      {themes.map((theme) => (
        <li key={theme.theme_id}>
          <button
            type="button"
            onClick={() => onOpen(theme)}
            className="group w-full text-left"
            title={`${theme.theme_name}: ${theme.positive_count} positive, ${theme.neutral_count} neutral, ${theme.negative_count} negative`}
          >
            <span className="flex items-baseline justify-between gap-3 text-sm">
              <span className="min-w-0 truncate font-medium group-hover:text-indigo-700">
                {theme.theme_name}
              </span>
              <span className="shrink-0 text-xs tabular-nums text-slate-500">
                {theme.total_count} items
              </span>
            </span>
            <span className="mt-1 flex h-3 overflow-hidden rounded-full bg-slate-100">
              <span
                className="flex h-full"
                style={{ width: `${(theme.total_count / max) * 100}%` }}
              >
                <span style={{ width: `${percent(theme.positive_count, theme.total_count)}%`, background: COLORS.positive }} />
                <span style={{ width: `${percent(theme.neutral_count, theme.total_count)}%`, background: COLORS.neutral }} />
                <span style={{ width: `${percent(theme.negative_count, theme.total_count)}%`, background: COLORS.negative }} />
              </span>
            </span>
          </button>
        </li>
      ))}
      <li className="flex gap-4 pt-1 text-xs text-slate-500">
        {(["positive", "neutral", "negative"] as const).map((name) => (
          <span key={name} className="inline-flex items-center gap-1.5 capitalize">
            <span className="size-2.5 rounded-full" style={{ background: COLORS[name] }} />
            {name}
          </span>
        ))}
      </li>
    </ul>
  );
}

function RankList({
  rows,
  value,
  tone,
  empty,
  onOpen,
}: {
  rows: Theme[];
  value: (theme: Theme) => number;
  tone: string;
  empty: string;
  onOpen: (theme: Theme) => void;
}) {
  if (!rows.length)
    return <p className="py-6 text-center text-sm text-slate-500">{empty}</p>;
  const max = Math.max(...rows.map(value), 1);
  return (
    <ol className="space-y-3">
      {rows.map((theme, index) => (
        <li key={theme.theme_id}>
          <button
            type="button"
            onClick={() => onOpen(theme)}
            className="w-full text-left"
          >
            <span className="flex items-baseline justify-between gap-3 text-sm">
              <span className="min-w-0 truncate">
                <span className="mr-2 text-xs text-slate-400">{index + 1}</span>
                {theme.theme_name}
              </span>
              <span className="shrink-0 text-xs tabular-nums text-slate-500">
                {value(theme)} of {theme.total_count}
              </span>
            </span>
            <span className="mt-1 block h-2 overflow-hidden rounded-full bg-slate-100">
              <span
                className={`block h-full rounded-full ${tone}`}
                style={{ width: `${(value(theme) / max) * 100}%` }}
              />
            </span>
          </button>
        </li>
      ))}
    </ol>
  );
}

function KeywordCard({
  keywords,
  className = "",
}: {
  keywords: Keyword[];
  className?: string;
}) {
  return (
    <Card
      title="Top keywords"
      hint="Words that appear in the most feedback, split by sentiment."
      className={className}
    >
      {keywords.length ? (
        <div style={{ height: Math.max(240, keywords.length * 30 + 50) }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={keywords}
              layout="vertical"
              margin={{ left: 4, right: 16 }}
            >
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" allowDecimals={false} />
              <YAxis
                type="category"
                dataKey="word"
                width={90}
                tick={{ fontSize: 12 }}
                interval={0}
              />
              <Tooltip />
              <Legend />
              <Bar dataKey="positive_count" name="Positive" stackId="k" fill={COLORS.positive} />
              <Bar dataKey="neutral_count" name="Neutral" stackId="k" fill={COLORS.neutral} />
              <Bar dataKey="negative_count" name="Negative" stackId="k" fill={COLORS.negative} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p className="py-8 text-center text-sm text-slate-500">
          Not enough repeated words yet.
        </p>
      )}
    </Card>
  );
}

function ProcessingPanel({ status, stalled }: { status: Status; stalled: boolean }) {
  const pct = (done: number) =>
    status.total ? Math.round((done / status.total) * 100) : 100;
  const steps = [
    { label: "Reading sentiment", done: status.classified, complete: status.classified >= status.total, counted: true },
    { label: "Understanding meaning", done: status.embedded, complete: status.embedded >= status.total, counted: true },
    { label: "Grouping themes", done: 0, complete: status.themesDone, counted: false },
  ];
  return (
    <div
      className="mt-6 rounded-lg border border-blue-200 bg-blue-50 p-4"
      role="status"
      aria-live="polite"
    >
      <p className="flex items-center gap-2 text-sm font-medium text-blue-900">
        <Loader2 className="size-4 animate-spin" aria-hidden /> Analysing your
        feedback. Results appear below as they are ready.
      </p>
      {stalled && (
        <p className="mt-2 text-xs text-blue-800">
          Still working. The analysis service runs on free hosting and can take up to a minute to wake up, or to wait out a rate limit. This page updates by itself.
        </p>
      )}
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
                style={{
                  width: `${step.counted ? pct(step.done) : step.complete ? 100 : 30}%`,
                }}
              />
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
