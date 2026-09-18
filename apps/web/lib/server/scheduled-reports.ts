import { workerDb } from './db';
import { generateScheduledReport } from './reports';

type Schedule = { tenant_id: string; cadence: 'weekly' | 'monthly'; last_generated_for: string | null };

const isoDate = (date: Date) => date.toISOString().slice(0, 10);

/**
 * Executes in the privileged report-schedule worker, never in a request
 * handler. Repeated invocations are safe because `last_generated_for` is
 * updated after each successful report.
 */
export async function generateDueScheduledReports(now = new Date()) {
  const isMonday = now.getUTCDay() === 1;
  const isMonthStart = now.getUTCDate() === 1;
  const schedules = await workerDb.query<Schedule>(
    'SELECT tenant_id, cadence, last_generated_for FROM report_schedules WHERE enabled = true',
  );
  let generated = 0;
  let failed = 0;

  for (const schedule of schedules.rows) {
    const due = schedule.cadence === 'weekly' ? isMonday : isMonthStart;
    if (!due || schedule.last_generated_for === isoDate(now)) continue;

    const end = new Date(now);
    end.setUTCDate(end.getUTCDate() - 1);
    const start = new Date(end);
    start.setUTCDate(start.getUTCDate() - (schedule.cadence === 'weekly' ? 6 : end.getUTCDate() - 1));

    const client = await workerDb.connect();
    try {
      await generateScheduledReport(client, schedule.tenant_id, isoDate(start), isoDate(end));
      await workerDb.query(
        'UPDATE report_schedules SET last_generated_for = $2, updated_at = now() WHERE tenant_id = $1',
        [schedule.tenant_id, isoDate(now)],
      );
      generated++;
    } catch (error) {
      console.error(`Scheduled report failed for ${schedule.tenant_id}`, error);
      failed++;
    } finally {
      client.release();
    }
  }

  return { checked: schedules.rowCount ?? 0, generated, failed };
}
