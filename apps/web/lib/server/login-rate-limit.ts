import { createHash } from 'node:crypto';
import Redis from 'ioredis';

declare global { var loopRateLimitRedis: Redis | undefined; }
const redis = globalThis.loopRateLimitRedis ?? new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', { maxRetriesPerRequest: 1, lazyConnect: true });
if (process.env.NODE_ENV !== 'production') globalThis.loopRateLimitRedis = redis;
const WINDOW_SECONDS = 15 * 60; const MAX_ATTEMPTS = 10;
const digest = (value: string) => createHash('sha256').update(value).digest('hex');

async function increment(key: string) { const count = await redis.incr(key); if (count === 1) await redis.expire(key, WINDOW_SECONDS); return { count, retryAfter: Math.max(1, Math.ceil((await redis.ttl(key)) || WINDOW_SECONDS)) }; }
export async function checkLoginRateLimit(email: string, ip: string) {
  try { if (redis.status === 'wait') await redis.connect(); const [byIp, byEmail] = await Promise.all([increment(`loop:login:ip:${digest(ip)}`), increment(`loop:login:email:${digest(email)}`)]); const retryAfter = Math.max(byIp.retryAfter, byEmail.retryAfter); return { allowed: byIp.count <= MAX_ATTEMPTS && byEmail.count <= MAX_ATTEMPTS, retryAfter }; }
  catch (error) { console.error('Login rate limiter unavailable', error); return { allowed: true, retryAfter: 0 }; }
}
export async function clearLoginRateLimit(email: string, ip: string) { try { await redis.del(`loop:login:ip:${digest(ip)}`, `loop:login:email:${digest(email)}`); } catch (error) { console.error('Unable to clear login rate limit', error); } }
