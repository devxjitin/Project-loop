import { timingSafeEqual } from 'node:crypto';
import { NextRequest } from 'next/server';

/** Constant-time validation for scheduler-only endpoints. */
export function hasValidCronSecret(request: NextRequest) {
  const expected = process.env.CRON_SECRET;
  const authorization = request.headers.get('authorization');
  if (!expected || !authorization) return false;
  const received = Buffer.from(authorization);
  const required = Buffer.from(`Bearer ${expected}`);
  return received.length === required.length && timingSafeEqual(received, required);
}
