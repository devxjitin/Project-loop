import { NextRequest } from 'next/server';
import { workerDb } from '@/lib/server/db';
import { hasValidCronSecret } from '@/lib/server/internal-auth';
import { generateScheduledReport } from '@/lib/server/reports';

export const runtime = 'nodejs';
const iso = (date: Date) => date.toISOString().slice(0, 10);
export async function POST(request: NextRequest) {
  if (!hasValidCronSecret(request)) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const today = new Date(); const isMonday = today.getUTCDay() === 1; const isMonthStart = today.getUTCDate() === 1;
  const schedules = await workerDb.query<{ tenant_id: string; cadence: 'weekly' | 'monthly'; last_generated_for: string | null }>('SELECT tenant_id, cadence, last_generated_for FROM report_schedules WHERE enabled = true');
  let generated = 0; let failed = 0;
  for (const schedule of schedules.rows) {
    const due = schedule.cadence === 'weekly' ? isMonday : isMonthStart;
    if (!due || schedule.last_generated_for === iso(today)) continue;
    const end = new Date(today); end.setUTCDate(end.getUTCDate() - 1); const start = new Date(end); start.setUTCDate(start.getUTCDate() - (schedule.cadence === 'weekly' ? 6 : end.getUTCDate() - 1));
    const client = await workerDb.connect();
    try { await generateScheduledReport(client, schedule.tenant_id, iso(start), iso(end)); await workerDb.query('UPDATE report_schedules SET last_generated_for = $2, updated_at = now() WHERE tenant_id = $1', [schedule.tenant_id, iso(today)]); generated++; }
    catch (error) { console.error(`Scheduled report failed for ${schedule.tenant_id}`, error); failed++; }
    finally { client.release(); }
  }
  return Response.json({ checked: schedules.rowCount, generated, failed });
}
