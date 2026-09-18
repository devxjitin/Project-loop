'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

export type Role = 'admin' | 'editor' | 'viewer';
type Session = { token: string; role: Role | null; ready: boolean; setToken: (token: string, refreshToken?: string) => void };
const SessionContext = createContext<Session | null>(null);
function payloadFromToken(token: string): { role?: string; exp?: number } { try { return JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))) as { role?: string; exp?: number }; } catch { return {}; } }
function roleFromToken(token: string): Role | null { const role = payloadFromToken(token).role; return role === 'admin' || role === 'editor' || role === 'viewer' ? role : null; }

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [token, updateToken] = useState(''); const [refreshToken, updateRefreshToken] = useState(''); const [ready, setReady] = useState(false);
  const setToken = useCallback((accessToken: string, nextRefreshToken?: string) => { updateToken(accessToken); if (accessToken) window.localStorage.setItem('loop.accessToken', accessToken); else window.localStorage.removeItem('loop.accessToken'); if (nextRefreshToken !== undefined) { updateRefreshToken(nextRefreshToken); if (nextRefreshToken) window.localStorage.setItem('loop.refreshToken', nextRefreshToken); else window.localStorage.removeItem('loop.refreshToken'); } if (!accessToken) { updateRefreshToken(''); window.localStorage.removeItem('loop.refreshToken'); } }, []);
  const expireSession = useCallback(() => { window.sessionStorage.setItem('loop.sessionExpired', '1'); setToken(''); }, [setToken]);
  const refresh = useCallback(async (storedRefreshToken: string) => {
    const response = await fetch('/api/auth/refresh', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ refreshToken: storedRefreshToken }) });
    const body = await response.json() as { accessToken?: string; refreshToken?: string };
    if (!response.ok || !body.accessToken || !body.refreshToken) { expireSession(); return null; }
    setToken(body.accessToken, body.refreshToken); return body;
  }, [expireSession, setToken]);
  useEffect(() => { const access = window.localStorage.getItem('loop.accessToken') ?? ''; const storedRefresh = window.localStorage.getItem('loop.refreshToken') ?? ''; updateToken(access); updateRefreshToken(storedRefresh); setReady(true); if (access && storedRefresh) { const exp = payloadFromToken(access).exp; if (!exp || exp * 1000 < Date.now() + 60_000) void refresh(storedRefresh); } }, [refresh]);
  useEffect(() => { if (!token || !refreshToken) return; const exp = payloadFromToken(token).exp; const delay = Math.max(1_000, (exp ?? Math.floor(Date.now() / 1000) + 14 * 60) * 1000 - Date.now() - 60_000); const timer = window.setTimeout(() => void refresh(refreshToken), delay); return () => window.clearTimeout(timer); }, [refresh, refreshToken, token]);
  useEffect(() => {
    const nativeFetch = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const response = await nativeFetch(input, init);
      const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
      const requestUrl = typeof input === 'string' ? input : input instanceof Request ? input.url : input.toString();
      if (response.status !== 401 || requestUrl.includes('/api/auth/refresh') || headers.get('x-loop-refresh-attempt') === '1' || !headers.get('authorization')?.match(/^Bearer\s+/i)) return response;
      const storedRefresh = window.localStorage.getItem('loop.refreshToken');
      if (!storedRefresh) { expireSession(); return response; }
      const refreshed = await nativeFetch('/api/auth/refresh', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ refreshToken: storedRefresh }) });
      const body = await refreshed.json().catch(() => ({})) as { accessToken?: string; refreshToken?: string };
      if (!refreshed.ok || !body.accessToken || !body.refreshToken) { expireSession(); return response; }
      setToken(body.accessToken, body.refreshToken);
      headers.set('authorization', `Bearer ${body.accessToken}`); headers.set('x-loop-refresh-attempt', '1');
      return nativeFetch(input, { ...init, headers });
    };
    return () => { window.fetch = nativeFetch; };
  }, [expireSession, setToken]);
  const value = useMemo(() => ({ token, role: roleFromToken(token), ready, setToken }), [ready, setToken, token]); return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
export function useSession() { const session = useContext(SessionContext); if (!session) throw new Error('useSession must be used inside SessionProvider.'); return session; }
export function SessionBar() { const { role } = useSession(); return <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-white p-4 shadow-sm"><div><p className="font-medium">Workspace session</p><p className="text-sm text-slate-600">Signed in as {role ?? 'a workspace member'}.</p></div></div>; }
