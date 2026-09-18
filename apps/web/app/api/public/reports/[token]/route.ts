import { createHash } from 'node:crypto';
import { NextRequest } from 'next/server';
import { db } from '@/lib/server/db';
export const runtime = 'nodejs'; const digest = (value: string) => createHash('sha256').update(value).digest('hex');
export async function GET(_request: NextRequest, { params }: { params: Promise<{ token: string }> }) { const { token } = await params; const result = await db.query('SELECT * FROM public_report_by_token($1)', [digest(token)]); const report = result.rows[0]; return report ? Response.json({ report }) : Response.json({ error: 'This report link is invalid or has expired.' }, { status: 404 }); }
