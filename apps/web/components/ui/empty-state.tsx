import type { ReactNode } from 'react';
import { Inbox } from 'lucide-react';
import { cn } from '@/lib/utils';

export function EmptyState({ title, description, action, icon: Icon = Inbox, className }: { title: string; description: string; action?: ReactNode; icon?: typeof Inbox; className?: string }) { return <div className={cn('flex min-h-52 flex-col items-center justify-center rounded-panel border border-dashed border-surface-border bg-surface-muted p-6 text-center', className)}><span className="grid size-11 place-items-center rounded-xl bg-brand-100 text-brand-700"><Icon className="size-5" /></span><h3 className="mt-4 font-semibold text-slate-900">{title}</h3><p className="mt-1 max-w-md text-sm leading-6 text-slate-600">{description}</p>{action && <div className="mt-4">{action}</div>}</div>; }
