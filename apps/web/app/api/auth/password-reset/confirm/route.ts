import { createHash } from 'node:crypto';
import { NextRequest } from 'next/server';
import { hashPassword, MIN_PASSWORD_LENGTH } from '@/lib/server/auth';
import { db } from '@/lib/server/db';

export const runtime = 'nodejs';
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { token?: string; password?: string };
    if (!body.token || !body.password || body.password.length < MIN_PASSWORD_LENGTH) return Response.json({ error: `Use a valid reset link and a password of at least ${MIN_PASSWORD_LENGTH} characters.` }, { status: 400 });
    const reset = (await db.query<{ consume_password_reset: boolean }>('SELECT consume_password_reset($1, $2)', [digest(body.token), await hashPassword(body.password)])).rows[0]?.consume_password_reset;
    if (!reset) return Response.json({ error: 'This password-reset link is invalid or expired.' }, { status: 400 });
    return Response.json({ reset: true });
  } catch (error) { console.error('Password reset failed', error); return Response.json({ error: 'Unable to reset password.' }, { status: 500 }); }
}
