import { setTenantContext, withTransaction } from '@/lib/server/db';

type CsvRow = Record<string, string>;

function parseCsv(text: string): CsvRow[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"') {
      if (quoted && text[index + 1] === '"') { cell += '"'; index += 1; } else quoted = !quoted;
    } else if (char === ',' && !quoted) { row.push(cell); cell = ''; }
    else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[index + 1] === '\n') index += 1;
      row.push(cell); cell = '';
      if (row.some((value) => value.length)) rows.push(row);
      row = [];
    } else cell += char;
  }
  row.push(cell);
  if (row.some((value) => value.length)) rows.push(row);
  const headers = rows.shift()?.map((value) => value.trim().replace(/^\uFEFF/, '')) ?? [];
  return rows.map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index]?.trim() ?? ''])));
}

export async function importCsvFeedback(input: { jobId: string; tenantId: string; content: ArrayBuffer; reviewColumn: string }) {
  try {
    const rows = parseCsv(new TextDecoder().decode(input.content));
    if (!rows.length || !Object.hasOwn(rows[0], input.reviewColumn)) throw new Error('The selected main review column was not found in this CSV.');
    const feedback = rows.map((row) => row[input.reviewColumn]?.trim()).filter((text): text is string => Boolean(text));
    const skipped = rows.length - feedback.length;
    await withTransaction(async (client) => {
      await setTenantContext(client, input.tenantId);
      await client.query("UPDATE ingestion_jobs SET status = 'processing', started_at = now() WHERE id = $1 AND tenant_id = $2", [input.jobId, input.tenantId]);
      for (let start = 0; start < feedback.length; start += 1000) {
        const chunk = feedback.slice(start, start + 1000);
        await client.query("INSERT INTO feedback_items (tenant_id, ingestion_job_id, source, raw_text, external_id) SELECT $1::uuid, $2::uuid, 'csv', t.text, $2::uuid::text || ':' || (t.ord - 1 + $3::bigint) FROM unnest($4::text[]) WITH ORDINALITY AS t(text, ord)", [input.tenantId, input.jobId, start, chunk]);
      }
      await client.query("UPDATE ingestion_jobs SET status = 'completed', row_count = $3, error_count = $4, completed_at = now() WHERE id = $1 AND tenant_id = $2", [input.jobId, input.tenantId, feedback.length, skipped]);
    });
    return { imported: feedback.length, skipped };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to process CSV.';
    await withTransaction(async (client) => {
      await setTenantContext(client, input.tenantId);
      await client.query("UPDATE ingestion_jobs SET status = 'failed', error_count = error_count + 1, error_log = jsonb_build_array(jsonb_build_object('message', $3::text)), completed_at = now() WHERE id = $1 AND tenant_id = $2", [input.jobId, input.tenantId, message]);
    });
    throw error;
  }
}
