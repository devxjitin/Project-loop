import { Pool, type PoolClient, type QueryResultRow } from 'pg';

declare global { var loopPool: Pool | undefined; }

export const db = globalThis.loopPool ?? new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: true } : undefined,
});
if (process.env.NODE_ENV !== 'production') globalThis.loopPool = db;

/** Used only by scheduled workers. Deploy this with a role that has BYPASSRLS, never in request handlers. */
export const workerDb = new Pool({ connectionString: process.env.DATABASE_WORKER_URL ?? process.env.DATABASE_URL, max: 2, ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: true } : undefined });

export async function withTransaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await db.connect();
  try { await client.query('BEGIN'); const result = await callback(client); await client.query('COMMIT'); return result; }
  catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}

export async function setTenantContext(client: PoolClient, tenantId: string) {
  await client.query("SELECT set_config('app.current_tenant_id', $1, true)", [tenantId]);
}
export async function setUserContext(client: PoolClient, userId: string) {
  await client.query("SELECT set_config('app.current_user_id', $1, true)", [userId]);
}

export type QueryRow<T extends QueryResultRow> = T;
