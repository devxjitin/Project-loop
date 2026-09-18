import * as React from 'react';
import { cn } from '@/lib/utils';

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(({ className, children, ...props }, ref) => <select ref={ref} className={cn('h-10 w-full rounded-lg border border-surface-border bg-white px-3 text-sm text-slate-900 shadow-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 disabled:cursor-not-allowed disabled:bg-slate-50', className)} {...props}>{children}</select>);
Select.displayName = 'Select';
