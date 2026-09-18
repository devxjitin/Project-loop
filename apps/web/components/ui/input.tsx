import * as React from 'react';
import { cn } from '@/lib/utils';

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => <input ref={ref} className={cn('h-10 w-full rounded-lg border border-surface-border bg-white px-3 text-sm text-slate-900 shadow-sm outline-none placeholder:text-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500', className)} {...props} />);
Input.displayName = 'Input';
