'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useState } from 'react';
import { LayoutDashboard } from 'lucide-react';
import { useSession } from '@/components/auth-session';
import { useNotification } from '@/components/notification';

type Mode = 'login' | 'signup';

export function AuthForm({ mode }: { mode: Mode }) {
  const isSignup = mode === 'signup';
  const router = useRouter();
  const { token, ready, setToken } = useSession();
  const { notify } = useNotification();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [organizationName, setOrganizationName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);

  useEffect(() => {
    if (ready && token) router.replace('/');
  }, [ready, router, token]);

  useEffect(() => {
    if (window.sessionStorage.getItem('loop.sessionExpired') === '1') {
      window.sessionStorage.removeItem('loop.sessionExpired');
      setSessionExpired(true);
    }
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!email.trim()) return notify('warning', 'Enter your email address to continue.');
    if (!password) return notify('warning', 'Enter your password to continue.');
    if (isSignup && !organizationName.trim()) return notify('warning', 'Enter your organization name to continue.');
    if (isSignup && password.length < 12) return notify('warning', 'Your password must contain at least 12 characters.');

    setSubmitting(true);
    try {
      const response = await fetch(`/api/auth/${mode}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(isSignup ? { email, password, organizationName, displayName } : { email, password }),
      });
      const body = await response.json() as { accessToken?: string; refreshToken?: string; error?: string };
      if (!response.ok || !body.accessToken) throw new Error(body.error ?? 'Unable to sign in.');
      setToken(body.accessToken, body.refreshToken ?? '');
      notify('success', isSignup ? 'Your workspace has been created.' : 'You are signed in.');
      router.replace('/');
    } catch (cause) {
      notify('failure', cause instanceof Error ? cause.message : 'Unable to sign in.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-slate-50 px-4 py-10">
      <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl shadow-slate-200/50 sm:p-8">
        <Link href="/login" className="mb-8 flex items-center gap-3 text-xl font-bold tracking-tight text-slate-900">
          <span className="grid size-10 place-items-center rounded-xl bg-blue-600 text-white"><LayoutDashboard className="size-5" /></span>
          LOOP
        </Link>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">{isSignup ? 'Create your workspace' : 'Welcome back'}</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">{isSignup ? 'Start turning customer feedback into clear next steps.' : sessionExpired ? 'Your session expired. Sign in again to continue.' : 'Sign in to your customer intelligence workspace.'}</p>
        <form className="mt-7 space-y-4" noValidate onSubmit={submit}>
          {isSignup && <>
            <label className="block text-sm font-medium text-slate-700">Your name
              <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} autoComplete="name" className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-100" />
            </label>
            <label className="block text-sm font-medium text-slate-700">Organization name
              <input value={organizationName} onChange={(event) => setOrganizationName(event.target.value)} autoComplete="organization" className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-100" />
            </label>
          </>}
          <label className="block text-sm font-medium text-slate-700">Email
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-100" />
          </label>
          <label className="block text-sm font-medium text-slate-700">Password
            <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={isSignup ? 'new-password' : 'current-password'} className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-100" />
            {isSignup && <span className="mt-1 block text-xs font-normal text-slate-500">Use at least 12 characters.</span>}
          </label>
          <button disabled={submitting} className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60">
            {submitting ? 'Please wait...' : isSignup ? 'Create workspace' : 'Sign in'}
          </button>
        </form>
        {!isSignup && <p className="mt-3 text-right text-sm"><Link href="/forgot-password" className="font-semibold text-blue-700 hover:text-blue-800">Forgot password?</Link></p>}
        <p className="mt-6 text-center text-sm text-slate-600">
          {isSignup ? 'Already have an account?' : 'New to LOOP?'}{' '}
          <Link href={isSignup ? '/login' : '/signup'} className="font-semibold text-blue-700 hover:text-blue-800">{isSignup ? 'Sign in' : 'Create a workspace'}</Link>
        </p>
      </section>
    </main>
  );
}
