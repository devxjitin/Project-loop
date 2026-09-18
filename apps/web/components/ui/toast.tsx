'use client';

import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { CheckCircle2, Info, TriangleAlert, X } from 'lucide-react';
import { cn } from '@/lib/utils';

type ToastTone = 'success' | 'error' | 'info'; type Toast = { id: number; message: string; tone: ToastTone };
const ToastContext = createContext<{ showToast: (message: string, tone?: ToastTone) => void } | null>(null);
const icons = { success: CheckCircle2, error: TriangleAlert, info: Info }; const colors = { success: 'border-emerald-200 bg-emerald-50 text-emerald-900', error: 'border-rose-200 bg-rose-50 text-rose-900', info: 'border-brand-200 bg-brand-50 text-brand-900' };
export function ToastProvider({ children }: { children: React.ReactNode }) { const [toasts, setToasts] = useState<Toast[]>([]); const showToast = useCallback((message: string, tone: ToastTone = 'info') => { const id = Date.now(); setToasts((items) => [...items, { id, message, tone }]); window.setTimeout(() => setToasts((items) => items.filter((item) => item.id !== id)), 5000); }, []); const value = useMemo(() => ({ showToast }), [showToast]); return <ToastContext.Provider value={value}>{children}<div className="fixed bottom-4 right-4 z-[60] grid w-[min(24rem,calc(100vw-2rem))] gap-2" aria-live="polite">{toasts.map((toast) => { const Icon = icons[toast.tone]; return <div key={toast.id} className={cn('flex items-start gap-3 rounded-xl border p-3 text-sm shadow-lg', colors[toast.tone])}><Icon className="mt-0.5 size-4 shrink-0" /><p className="flex-1">{toast.message}</p><button aria-label="Dismiss notification" onClick={() => setToasts((items) => items.filter((item) => item.id !== toast.id))}><X className="size-4" /></button></div>; })}</div></ToastContext.Provider>; }
export function useToast() { const context = useContext(ToastContext); if (!context) throw new Error('useToast must be used inside ToastProvider.'); return context; }
