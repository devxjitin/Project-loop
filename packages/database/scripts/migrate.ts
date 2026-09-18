import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Client } from 'pg';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required to run migrations.');
const migrations = join(import.meta.dirname, '..', 'migrations');
const client = new Client({ connectionString: databaseUrl });
await client.connect();
try {
  await client.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');
  await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())');
  const applied = new Set((await client.query<{ name: string }>('SELECT name FROM schema_migrations')).rows.map((row) => row.name));
  for (const file of (await readdir(migrations)).filter((name) => name.endsWith('.sql')).sort()) {
    if (applied.has(file)) continue;
    await client.query('BEGIN');
    try {
      await client.query(await readFile(join(migrations, file), 'utf8'));
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
      await client.query('COMMIT');
      console.log(`Applied ${file}`);
    } catch (error) { await client.query('ROLLBACK'); throw error; }
  }
} finally { await client.end(); }
