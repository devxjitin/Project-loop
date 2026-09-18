'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { LayoutDashboard } from 'lucide-react';
import { useSession } from '@/components/auth-session';
import { useNotification } from '@/components/notification';

export function InviteAccept() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setToken } = useSession();
  const { notify } = useNotification();
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const token = searchParams.get('token');

  async function accept(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return notify('warning', 'This invitation link is missing its token.');
    if (!password) return notify('warning', 'Create a password to continue.');
    if (password.length < 12) return notify('warning', 'Your password must contain at least 12 characters.');
    setSubmitting(true);
    try {
      const response = await fetch('/api/invitations/accept', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token, displayName, password }) });
      const body = await response.json() as { accessToken?: string; refreshToken?: string; error?: string };
      if (!response.ok || !body.accessToken) throw new Error(body.error ?? 'Unable to accept invitation.');
      setToken(body.accessToken, body.refreshToken ?? '');
      notify('success', 'Your account is ready. Welcome to LOOP.');
      router.replace('/');
    } catch (cause) {
      notify('failure', cause instanceof Error ? cause.message : 'Unable to accept invitation.');
    } finally {
      setSubmitting(false);
    }
  }

  return <main className="grid min-h-screen place-items-center bg-slate-50 px-4 py-10"><section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl shadow-slate-200/50 sm:p-8"><Link href="/login" className="mb-8 flex items-center gap-3 text-xl font-bold tracking-tight text-slate-900"><span className="grid size-10 place-items-center rounded-xl bg-blue-600 text-white"><LayoutDashboard className="size-5" /></span>LOOP</Link><h1 className="text-2xl font-bold tracking-tight text-slate-900">Join your workspace</h1><p className="mt-2 text-sm leading-6 text-slate-600">Set your name and password to activate your invited account.</p><form className="mt-7 space-y-4" noValidate onSubmit={accept}><label className="block text-sm font-medium text-slate-700">Your name<input value={displayName} onChange={(event) => setDisplayName(event.target.value)} autoComplete="name" className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-100" /></label><label className="block text-sm font-medium text-slate-700">Create a password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-100" /><span className="mt-1 block text-xs font-normal text-slate-500">Use at least 12 characters.</span></label><button disabled={submitting || !token} className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60">{submitting ? 'Creating account...' : 'Create account'}</button></form>{!token && <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">This invitation link is incomplete. Ask your organization admin for a new link.</p>}</section></main>;
}
