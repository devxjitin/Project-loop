'use client';

import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from 'lucide-react';
import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';

type NotificationKind = 'success' | 'failure' | 'warning' | 'info';
type Notification = { id: number; kind: NotificationKind; message: string };
type NotificationContextValue = { notify: (kind: NotificationKind, message: string) => void };

const NotificationContext = createContext<NotificationContextValue | null>(null);
const styles: Record<NotificationKind, { icon: typeof CheckCircle2; className: string; label: string }> = {
  success: { icon: CheckCircle2, className: 'border-emerald-200 bg-emerald-50 text-emerald-900', label: 'Success' },
  failure: { icon: AlertCircle, className: 'border-rose-200 bg-rose-50 text-rose-900', label: 'Something went wrong' },
  warning: { icon: AlertTriangle, className: 'border-amber-200 bg-amber-50 text-amber-900', label: 'Please check this' },
  info: { icon: Info, className: 'border-blue-200 bg-blue-50 text-blue-900', label: 'Notice' },
};

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const nextId = useRef(0);
  const dismiss = useCallback((id: number) => setNotifications((items) => items.filter((item) => item.id !== id)), []);
  const notify = useCallback((kind: NotificationKind, message: string) => {
    const id = nextId.current++;
    setNotifications((items) => [...items, { id, kind, message }]);
    window.setTimeout(() => dismiss(id), 5000);
  }, [dismiss]);
  const value = useMemo(() => ({ notify }), [notify]);

  return <NotificationContext.Provider value={value}>{children}<div aria-live="polite" aria-atomic="true" className="fixed right-4 top-4 z-50 flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-3">{notifications.map((notification) => { const style = styles[notification.kind]; const Icon = style.icon; return <div key={notification.id} role="status" className={`flex items-start gap-3 rounded-xl border p-4 shadow-lg ${style.className}`}><Icon className="mt-0.5 size-5 shrink-0" aria-hidden /><div className="min-w-0 flex-1"><p className="text-sm font-semibold">{style.label}</p><p className="mt-0.5 text-sm leading-5">{notification.message}</p></div><button onClick={() => dismiss(notification.id)} aria-label="Dismiss notification" className="rounded-md p-1 opacity-70 transition hover:bg-black/5 hover:opacity-100"><X className="size-4" /></button></div>; })}</div></NotificationContext.Provider>;
}

export function useNotification() {
  const context = useContext(NotificationContext);
  if (!context) throw new Error('useNotification must be used inside NotificationProvider.');
  return context;
}
