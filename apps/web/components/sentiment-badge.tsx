import { CheckCircle2, CircleMinus, Frown } from 'lucide-react';
import { cn } from '@/lib/utils';

export type Sentiment = 'positive' | 'neutral' | 'negative';
const styles = { positive: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20', neutral: 'bg-slate-100 text-slate-700 ring-slate-600/20', negative: 'bg-rose-50 text-rose-700 ring-rose-600/20' } as const;
const icons = { positive: CheckCircle2, neutral: CircleMinus, negative: Frown } as const;
export function SentimentBadge({ sentiment, className }: { sentiment: Sentiment; className?: string }) {
  const Icon = icons[sentiment];
  return <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium capitalize ring-1 ring-inset', styles[sentiment], className)}><Icon aria-hidden className="size-3.5" />{sentiment}</span>;
}
