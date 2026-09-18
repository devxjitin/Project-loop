import { createHash, randomBytes } from 'node:crypto';
import { NextRequest } from 'next/server';
import { db } from '@/lib/server/db';
import { sendTransactionalEmail } from '@/lib/server/email';

export const runtime = 'nodejs';
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const generic = { message: 'If that email belongs to an account, a password-reset link has been sent.' };

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { email?: string };
    const email = body.email?.trim().toLowerCase();
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) return Response.json(generic);
    const token = randomBytes(32).toString('base64url');
    const exists = (await db.query<{ request_password_reset: boolean }>('SELECT request_password_reset($1, $2)', [email, digest(token)])).rows[0]?.request_password_reset;
    if (exists) {
      const resetUrl = new URL(`/reset-password?token=${encodeURIComponent(token)}`, process.env.APP_URL ?? request.url).toString();
      try { await sendTransactionalEmail({ to: email, subject: 'Reset your Project LOOP password', html: `<p>Use this secure link to reset your Project LOOP password:</p><p><a href="${resetUrl}">Reset password</a></p><p>This link expires in one hour. If you did not request a reset, you can ignore this email.</p>` }); }
      catch (error) { console.error('Password-reset email delivery failed', error); }
    }
    return Response.json(generic);
  } catch (error) { console.error('Password-reset request failed', error); return Response.json(generic); }
}
