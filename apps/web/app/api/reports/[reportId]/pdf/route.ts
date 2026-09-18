import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { NextRequest } from 'next/server';
import { AuthError, requireActiveAuth } from '@/lib/server/auth';
import { setTenantContext, withTransaction } from '@/lib/server/db';

export const runtime = 'nodejs';
const run = promisify(execFile);
const defaultBrowserPath = process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : '/usr/bin/chromium';
const escape = (value: string) => value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);

export async function GET(request: NextRequest, { params }: { params: Promise<{ reportId: string }> }) {
  try {
    const claims = await requireActiveAuth(request);
    const { reportId } = await params;
    const report = await withTransaction(async (client) => {
      await setTenantContext(client, claims.tenantId);
      return (await client.query<{ period_start: string; period_end: string; content: string; generated_at: string }>("SELECT period_start, period_end, content, generated_at FROM reports WHERE id = $1 AND tenant_id = $2 AND status = 'ready'", [reportId, claims.tenantId])).rows[0];
    });
    if (!report) return Response.json({ error: 'Ready report not found.' }, { status: 404 });
    const directory = await mkdtemp(join(tmpdir(), 'loop-report-'));
    const source = join(directory, 'report.html'); const pdf = join(directory, 'report.pdf');
    const html = `<!doctype html><html><head><meta charset="utf-8"><style>@page{margin:22mm}body{font:14px Arial;color:#172033;line-height:1.6}header{border-bottom:1px solid #dbe1ea;padding-bottom:18px}small{color:#4f46e5;letter-spacing:2px;font-weight:bold}h1{font-size:28px;margin:8px 0}article{white-space:pre-wrap;margin-top:28px}footer{border-top:1px solid #dbe1ea;margin-top:35px;padding-top:12px;color:#64748b;font-size:11px}</style></head><body><header><small>PROJECT LOOP</small><h1>Voice-of-Customer report</h1><p>${escape(report.period_start)} to ${escape(report.period_end)}</p></header><article>${escape(report.content)}</article><footer>Generated ${escape(String(report.generated_at))}</footer></body></html>`;
    try {
      await writeFile(source, html);
      await run(process.env.CHROME_PATH ?? defaultBrowserPath, ['--headless=new', '--no-sandbox', `--print-to-pdf=${pdf}`, source], { timeout: 30_000, windowsHide: true });
      const output = await readFile(pdf);
      return new Response(output, { headers: { 'content-type': 'application/pdf', 'content-disposition': `attachment; filename="loop-voc-${report.period_start}-to-${report.period_end}.pdf"` } });
    } finally { await rm(directory, { recursive: true, force: true }); }
  } catch (error) {
    if (error instanceof AuthError) return Response.json({ error: error.message }, { status: error.status });
    console.error('Report PDF export failed', error);
    return Response.json({ error: 'Unable to export report PDF. Configure CHROME_PATH on the server.' }, { status: 503 });
  }
}
