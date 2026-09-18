import { cn } from '@/lib/utils';

export function Table({ className, ...props }: React.ComponentProps<'table'>) {
  return <div className="w-full overflow-x-auto"><table className={cn('w-full border-collapse text-left text-sm', className)} {...props} /></div>;
}

export function TableHead({ className, ...props }: React.ComponentProps<'thead'>) {
  return <thead className={cn('border-b bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-600', className)} {...props} />;
}

export function TableBody({ className, ...props }: React.ComponentProps<'tbody'>) {
  return <tbody className={cn('divide-y divide-slate-100', className)} {...props} />;
}

export function TableRow({ className, ...props }: React.ComponentProps<'tr'>) {
  return <tr className={cn('transition-colors hover:bg-slate-50', className)} {...props} />;
}

export function TableHeaderCell({ className, ...props }: React.ComponentProps<'th'>) {
  return <th className={cn('px-4 py-3 font-semibold', className)} {...props} />;
}

export function TableCell({ className, ...props }: React.ComponentProps<'td'>) {
  return <td className={cn('px-4 py-3 align-top text-slate-700', className)} {...props} />;
}
