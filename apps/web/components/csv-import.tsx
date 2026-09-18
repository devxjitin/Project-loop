"use client";

import { ChangeEvent, useEffect, useState } from "react";
import { FileUp, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNotification } from "@/components/notification";
import { useSession } from "@/components/auth-session";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

type ImportJob = {
  id: string;
  original_filename: string;
  status: string;
  size_bytes: number;
  created_at: string;
};
const bytes = (value: number) =>
  value < 1_048_576
    ? Math.ceil(value / 1024) + " KB"
    : (value / 1_048_576).toFixed(1) + " MB";
const parseHeaders = (row: string) => {
  const items: string[] = [];
  let item = "";
  let quoted = false;
  for (let index = 0; index < row.length; index += 1) {
    const char = row[index];
    if (char === '"') quoted = !quoted;
    else if (char === "," && !quoted) {
      items.push(item.trim());
      item = "";
    } else item += char;
  }
  items.push(item.trim());
  return items.map((value) => value.replace(/^\uFEFF/, "")).filter(Boolean);
};

export function CsvImport() {
  const { token, role } = useSession();
  const { notify } = useNotification();
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [reviewColumn, setReviewColumn] = useState("");
  const [jobs, setJobs] = useState<ImportJob[]>([]);
  const [deleteCandidate, setDeleteCandidate] = useState<ImportJob | null>(
    null,
  );
  const [progress, setProgress] = useState<number | null>(null);
  const canUpload = role === "admin" || role === "editor";

  const load = async () => {
    if (!token) return;
    const response = await fetch("/api/ingestions", {
      headers: { Authorization: "Bearer " + token },
    });
    const body = (await response.json()) as {
      jobs?: ImportJob[];
      error?: string;
    };
    if (response.ok) setJobs(body.jobs ?? []);
    else notify("failure", body.error ?? "Unable to load uploads.");
  };
  useEffect(() => {
    void load(); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0];
    if (!selected) return;
    if (!selected.name.toLowerCase().endsWith(".csv"))
      return notify("warning", "Choose a CSV file.");
    if (selected.size > 52_428_800)
      return notify("warning", "CSV files must be 50 MB or smaller.");
    const row =
      (await selected.slice(0, 262_144).text()).split(/\r?\n/, 1)[0] ?? "";
    const columns = parseHeaders(row);
    if (!columns.length)
      return notify("warning", "We could not find a header row in this CSV.");
    setFile(selected);
    setName(selected.name.replace(/\.csv$/i, ""));
    setHeaders(columns);
    setReviewColumn(columns[0]);
  }

  async function upload() {
    if (!file) return notify("warning", "Choose a CSV file before uploading.");
    if (!name.trim()) return notify("warning", "Give this dataset a name.");
    if (!reviewColumn)
      return notify("warning", "Select the main review column.");
    const filename = name.trim().toLowerCase().endsWith(".csv")
      ? name.trim()
      : name.trim() + ".csv";
    setProgress(0);
    try {
      const response = await fetch("/api/ingestions", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + token,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          filename,
          contentType: file.type || "text/csv",
          sizeBytes: file.size,
          columnMapping: { text: reviewColumn },
        }),
      });
      const body = (await response.json()) as {
        uploadUrl?: string;
        error?: string;
      };
      if (!response.ok || !body.uploadUrl)
        throw new Error(body.error ?? "Unable to start the CSV upload.");
      await new Promise<void>((resolve, reject) => {
        const request = new XMLHttpRequest();
        request.open("PUT", body.uploadUrl!);
        request.setRequestHeader("Authorization", "Bearer " + token);
        request.setRequestHeader("Content-Type", file.type || "text/csv");
        request.upload.onprogress = (event) => {
          if (event.lengthComputable)
            setProgress(Math.round((event.loaded / event.total) * 100));
        };
        request.onload = () => {
          if (request.status >= 200 && request.status < 300) resolve();
          else {
            try {
              reject(
                new Error(
                  (JSON.parse(request.responseText) as { error?: string })
                    .error ?? "Unable to upload CSV.",
                ),
              );
            } catch {
              reject(new Error("Unable to upload CSV."));
            }
          }
        };
        request.onerror = () =>
          reject(new Error("Unable to upload CSV. Network connection failed."));
        request.send(file);
      });
      setFile(null);
      setName("");
      setHeaders([]);
      setReviewColumn("");
      setProgress(null);
      notify("success", "Dataset uploaded and feedback imported.");
      await load();
    } catch (cause) {
      setProgress(null);
      notify(
        "failure",
        cause instanceof Error ? cause.message : "Unable to upload CSV.",
      );
    }
  }

  async function remove(job: ImportJob) {
    const response = await fetch("/api/ingestions/" + job.id, {
      method: "DELETE",
      headers: { Authorization: "Bearer " + token },
    });
    const body = (await response.json()) as { error?: string };
    if (!response.ok)
      return notify(
        "failure",
        body.error ?? "Unable to delete dataset upload.",
      );
    notify("success", "Dataset upload history deleted.");
    await load();
  }

  return (
    <>
      <section className="w-full rounded-xl border bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold">Upload customer dataset</h2>
            <p className="mt-1 text-sm text-slate-600">
              Choose any CSV, rename the dataset, then select the column
              containing the main customer reviews.
            </p>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold capitalize text-slate-600">
            {role ?? "viewer"}
          </span>
        </div>
        {canUpload ? (
          <>
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <label className="flex min-h-32 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 p-4 text-center">
                <FileUp className="size-7 text-blue-600" />
                <span className="mt-2 text-sm font-medium">
                  {file ? file.name : "Choose a CSV file"}
                </span>
                <span className="mt-1 text-xs text-slate-500">
                  {file
                    ? bytes(file.size) +
                      " · " +
                      headers.length +
                      " columns found"
                    : "CSV only, maximum 50 MB"}
                </span>
                <input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(event) => void chooseFile(event)}
                  className="sr-only"
                />
              </label>
              <div className="grid gap-3">
                <label className="text-sm font-medium">
                  Dataset name
                  <input
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    disabled={!file}
                    className="mt-1 block w-full rounded-md border px-3 py-2 disabled:bg-slate-100"
                  />
                </label>
                <label className="text-sm font-medium">
                  Main review column
                  <select
                    value={reviewColumn}
                    onChange={(event) => setReviewColumn(event.target.value)}
                    disabled={!headers.length}
                    className="mt-1 block w-full rounded-md border bg-white px-3 py-2 disabled:bg-slate-100"
                  >
                    <option value="">Select a column</option>
                    {headers.map((header) => (
                      <option key={header}>{header}</option>
                    ))}
                  </select>
                </label>
                <p className="text-xs text-slate-500">
                  Date fields are not imported.
                </p>
              </div>
            </div>
            <div className="mt-5 flex items-center gap-4">
              <Button
                onClick={() => void upload()}
                disabled={!file || progress !== null}
              >
                <Upload className="mr-2 size-4" />
                {progress === null
                  ? "Upload dataset"
                  : "Uploading " + progress + "%"}
              </Button>
              {progress !== null && (
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full bg-blue-600"
                    style={{ width: progress + "%" }}
                  />
                </div>
              )}
            </div>
          </>
        ) : (
          <p className="mt-6 rounded-lg bg-amber-50 p-4 text-sm text-amber-800">
            Only admins and editors can upload CSV files.
          </p>
        )}
        <div className="mt-8 border-t pt-5">
          <h3 className="font-semibold">Recent uploads</h3>
          <div className="mt-3 overflow-hidden rounded-lg border">
            <div className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] gap-3 bg-slate-50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <span>Dataset</span>
              <span>Status</span>
              <span>Uploaded</span>
              <span></span>
            </div>
            {jobs.length ? (
              jobs.map((job) => (
                <div
                  key={job.id}
                  className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] items-center gap-3 border-t px-4 py-3 text-sm"
                >
                  <span className="truncate font-medium">
                    {job.original_filename.replace(/\.csv$/i, "")}{" "}
                    <span className="text-xs font-normal text-slate-500">
                      {bytes(Number(job.size_bytes))}
                    </span>
                  </span>
                  <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs capitalize text-blue-700">
                    {job.status.replace("_", " ")}
                  </span>
                  <span className="text-xs text-slate-500">
                    {new Date(job.created_at).toLocaleString()}
                  </span>
                  {role === "admin" && (
                    <button
                      onClick={() => setDeleteCandidate(job)}
                      aria-label={"Delete " + job.original_filename}
                      className="rounded-md p-2 text-rose-600 hover:bg-rose-50"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  )}
                </div>
              ))
            ) : (
              <p className="px-4 py-5 text-sm text-slate-500">
                No datasets uploaded yet.
              </p>
            )}
          </div>
        </div>
      </section>
      {deleteCandidate && (
        <ConfirmDialog
          open
          title="Delete upload history?"
          description={`Delete ${deleteCandidate.original_filename}? This cannot be undone.`}
          confirmLabel="Delete upload"
          onClose={() => setDeleteCandidate(null)}
          onConfirm={() => remove(deleteCandidate)}
        />
      )}
    </>
  );
}
