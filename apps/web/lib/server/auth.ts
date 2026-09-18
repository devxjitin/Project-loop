import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { NextRequest } from 'next/server';
import { setTenantContext, setUserContext, withTransaction } from '@/lib/server/db';

export const roles = ['admin', 'editor', 'viewer'] as const;
export const MIN_PASSWORD_LENGTH = 12;
export type Role = (typeof roles)[number];
export type AuthClaims = { sub: string; tenantId: string; role: Role; type: 'access' | 'refresh' };

function secret() {
  const value = process.env.JWT_SECRET;
  if (!value || value.length < 32) throw new Error('JWT_SECRET must be set to a value at least 32 characters long.');
  return value;
}
export const hashPassword = (password: string) => bcrypt.hash(password, 12);
export const verifyPassword = (password: string, hash: string) => bcrypt.compare(password, hash);
export function issueTokens({ sub, tenantId, role }: Omit<AuthClaims, 'type'>) {
  const common = { sub, tenantId, role };
  return {
    accessToken: jwt.sign({ ...common, type: 'access' }, secret(), { expiresIn: '15m' }),
    refreshToken: jwt.sign({ ...common, type: 'refresh' }, secret(), { expiresIn: '7d' }),
  };
}
export function requireAuth(request: NextRequest): AuthClaims {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) throw new AuthError(401, 'Missing bearer token.');
  try {
    const claims = jwt.verify(token, secret()) as AuthClaims;
    if (claims.type !== 'access') throw new AuthError(401, 'Access token required.');
    return claims;
  } catch (error) {
    if (error instanceof AuthError) throw error;
    throw new AuthError(401, 'Invalid or expired token.');
  }
}
export function requireRole(claims: AuthClaims, ...allowed: Role[]) {
  if (!allowed.includes(claims.role)) throw new AuthError(403, 'Insufficient role.');
}
export function requireRefreshToken(token: string): AuthClaims {
  try {
    const claims = jwt.verify(token, secret()) as AuthClaims;
    if (claims.type !== 'refresh') throw new AuthError(401, 'Refresh token required.');
    return claims;
  } catch (error) {
    if (error instanceof AuthError) throw error;
    throw new AuthError(401, 'Invalid or expired refresh token.');
  }
}
/** Resolve role and status at request time so a demotion or revocation takes effect immediately. */
export async function requireActiveAuth(request: NextRequest): Promise<AuthClaims> {
  const claims = requireAuth(request);
  const membership = await withTransaction(async (client) => {
    await setUserContext(client, claims.sub);
    await setTenantContext(client, claims.tenantId);
    return (await client.query<{ role: Role }>("SELECT role FROM memberships WHERE tenant_id = $1 AND user_id = $2 AND status = 'active'", [claims.tenantId, claims.sub])).rows[0];
  });
  if (!membership) throw new AuthError(401, 'Your workspace access is no longer active.');
  return { ...claims, role: membership.role };
}
export class AuthError extends Error { constructor(public status: number, message: string) { super(message); } }
