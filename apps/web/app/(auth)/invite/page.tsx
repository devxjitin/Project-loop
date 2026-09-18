import { Suspense } from 'react';
import { InviteAccept } from '@/components/invite-accept';

export default function InvitePage() {
  return <Suspense fallback={<main className="grid min-h-screen place-items-center text-sm text-slate-500">Loading invitation...</main>}><InviteAccept /></Suspense>;
}
