import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

const styles = { neutral: 'bg-slate-100 text-slate-700', info: 'bg-brand-50 text-brand-700', success: 'bg-emerald-50 text-emerald-700', warning: 'bg-amber-50 text-amber-800', danger: 'bg-rose-50 text-rose-700' };
export function Badge({ tone = 'neutral', className, ...props }: HTMLAttributes<HTMLSpanElement> & { tone?: keyof typeof styles }) { return <span className={cn('inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold', styles[tone], className)} {...props} />; }
