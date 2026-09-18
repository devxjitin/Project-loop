"use client";

import { Download, Link as LinkIcon, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useSession } from "@/components/auth-session";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { DataLoadError } from "@/components/ui/data-load-error";
import { Input } from "@/components/ui/input";

type Report = {
  id: string;
  period_start: string;
  period_end: string;
  status: string;
  content: string | null;
};
type ShareLink = { id: string; expires_at: string; created_at: string };
const dateForInput = (date: Date) => date.toISOString().slice(0, 10);

export function ReportGenerator() {
  const { token, role } = useSession();
  const [reports, setReports] = useState<Report[]>([]);
  const [from, setFrom] = useState(() =>
    dateForInput(new Date(Date.now() - 6 * 86_400_000)),
  );
  const [to, setTo] = useState(() => dateForInput(new Date()));
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingReports, setLoadingReports] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [shareUrl, setShareUrl] = useState("");
  const [shareExpiry, setShareExpiry] = useState(() =>
    dateForInput(new Date(Date.now() + 30 * 86_400_000)),
  );
  const [links, setLinks] = useState<Record<string, ShareLink[]>>({});
  const headers = {
    Authorization: `Bearer ${token}`,
    "content-type": "application/json",
  };

  const load = useCallback(
    async (silent = false) => {
      if (!token) return;
      if (!silent) setLoadingReports(true);
      try {
        const response = await fetch("/api/reports", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const body = await response.json();
        if (!response.ok)
          throw new Error(body.error ?? "Unable to load reports.");
        setReports(body.reports);
        setLoadError("");
      } catch (error) {
        setLoadError(
          error instanceof Error ? error.message : "Unable to load reports.",
        );
      } finally {
        if (!silent) setLoadingReports(false);
      }
    },
    [token],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const loadLinks = async (reportId: string) => {
    const response = await fetch(`/api/reports/${reportId}/share`, { headers });
    const body = await response.json();
    if (!response.ok)
      throw new Error(body.error ?? "Unable to load share links.");
    setLinks((current) => ({ ...current, [reportId]: body.links }));
  };

  const generate = async () => {
    setLoading(true);
    setMessage("Starting report generation…");
    const pollingId = window.setInterval(() => void load(true), 1_500);
    try {
      const response = await fetch("/api/reports", {
        method: "POST",
        headers,
        body: JSON.stringify({ from, to }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      setMessage("Report generated and ready to review.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to generate report.",
      );
    } finally {
      window.clearInterval(pollingId);
      setLoading(false);
      await load(true);
    }
  };

  const share = async (reportId: string) => {
    setMessage("");
    try {
      const response = await fetch(`/api/reports/${reportId}/share`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          expiresAt: new Date(`${shareExpiry}T23:59:59.999Z`).toISOString(),
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      setShareUrl(body.url);
      await navigator.clipboard?.writeText(body.url);
      await loadLinks(reportId);
      setMessage("Share link created and copied to your clipboard.");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to create a share link.",
      );
    }
  };

  const revoke = async (reportId: string, shareTokenId: string) => {
    try {
      const response = await fetch(
        `/api/reports/${reportId}/share?shareTokenId=${encodeURIComponent(shareTokenId)}`,
        { method: "DELETE", headers },
      );
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      await loadLinks(reportId);
      setMessage("Share link revoked.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to revoke share link.",
      );
    }
  };

  const download = async (reportId: string) => {
    setMessage("");
    try {
      const response = await fetch(`/api/reports/${reportId}/pdf`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        const body = await response.json();
        throw new Error(body.error);
      }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = "loop-voc-report.pdf";
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to export this PDF.",
      );
    }
  };

  return (
    <section className="w-full max-w-6xl rounded-xl border bg-white p-6 shadow-sm">
      <h2 className="text-xl font-semibold">Voice-of-Customer reports</h2>
      <p className="mt-1 text-sm text-slate-600">
        An executive-ready summary grounded in the selected period&apos;s
        dashboard data and customer voices.
      </p>
      {role === "admin" && (
        <div className="mt-5 flex flex-wrap items-end gap-3">
          <label className="text-sm">
            From
            <Input
              type="date"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
              className="ml-2 rounded border px-2 py-1"
            />
          </label>
          <label className="text-sm">
            To
            <Input
              type="date"
              value={to}
              onChange={(event) => setTo(event.target.value)}
              className="ml-2 rounded border px-2 py-1"
            />
          </label>
          <Button onClick={() => void generate()} disabled={!token || loading}>
            {loading ? "Generating…" : "Generate now"}
          </Button>
        </div>
      )}
      {message && (
        <p role="status" className="mt-3 text-sm text-slate-700">
          {message}
        </p>
      )}
      {loadError && (
        <DataLoadError message={loadError} onRetry={() => void load()} />
      )}
      {shareUrl && (
        <div className="mt-3 rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm">
          <p className="font-medium text-blue-900">New share link</p>
          <a
            className="mt-1 block break-all text-blue-700 underline"
            href={shareUrl}
            target="_blank"
            rel="noreferrer"
          >
            {shareUrl}
          </a>
        </div>
      )}
      <div className="mt-5 space-y-3">
        {loadingReports ? (
          <div className="space-y-3" aria-label="Loading reports">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : !reports.length ? (
          <EmptyState
            title="No reports yet"
            description="Generate your first Voice-of-Customer report to share a concise view of what customers are saying."
          />
        ) : (
          reports.map((report) => (
            <details key={report.id} className="rounded-lg border p-4">
              <summary className="cursor-pointer font-medium">
                {report.period_start} to {report.period_end}{" "}
                <span className="ml-2 text-xs capitalize text-slate-500">
                  {report.status}
                </span>
              </summary>
              {report.content && (
                <article className="mt-4 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                  {report.content}
                </article>
              )}
              {report.status === "ready" && (
                <div className="mt-4 space-y-3">
                  <div className="flex flex-wrap gap-2">
                    <Button
                      className="bg-slate-700 hover:bg-slate-600"
                      onClick={() => void download(report.id)}
                    >
                      <Download className="mr-2 size-4" />
                      Download PDF
                    </Button>
                    {role === "admin" && (
                      <Button onClick={() => void share(report.id)}>
                        <LinkIcon className="mr-2 size-4" />
                        Create share link
                      </Button>
                    )}
                  </div>
                  {role === "admin" && (
                    <div className="rounded-lg bg-slate-50 p-3">
                      <div className="flex flex-wrap items-end gap-2">
                        <label className="text-xs font-medium text-slate-600">
                          New link expires
                          <Input
                            aria-label="Share link expiry"
                            type="date"
                            min={dateForInput(new Date())}
                            max={dateForInput(
                              new Date(Date.now() + 90 * 86_400_000),
                            )}
                            value={shareExpiry}
                            onChange={(event) =>
                              setShareExpiry(event.target.value)
                            }
                            className="ml-2 rounded border bg-white px-2 py-1 text-sm"
                          />
                        </label>
                        <Button
                          className="bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-100"
                          onClick={() => void loadLinks(report.id)}
                        >
                          Manage active links
                        </Button>
                      </div>
                      {links[report.id] && (
                        <ul className="mt-3 space-y-2 text-sm">
                          {!links[report.id].length ? (
                            <li className="text-slate-500">
                              No active share links.
                            </li>
                          ) : (
                            links[report.id].map((link) => (
                              <li
                                key={link.id}
                                className="flex flex-wrap items-center justify-between gap-2"
                              >
                                <span>
                                  Expires{" "}
                                  {new Date(link.expires_at).toLocaleString()}
                                </span>
                                <Button
                                  className="bg-white text-red-700 ring-1 ring-red-200 hover:bg-red-50"
                                  onClick={() =>
                                    void revoke(report.id, link.id)
                                  }
                                >
                                  <Trash2 className="mr-1 size-4" />
                                  Revoke
                                </Button>
                              </li>
                            ))
                          )}
                        </ul>
                      )}
                    </div>
                  )}
                </div>
              )}
            </details>
          ))
        )}
      </div>
    </section>
  );
}
