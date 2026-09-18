import { Tag } from 'lucide-react';
import { cn } from '@/lib/utils';

/** A non-interactive label so it is safe inside the selectable feedback-row button. */
export function ThemeTag({ name, className }: { name: string; className?: string; onClick?: () => void }) {
  return <span className={cn('inline-flex items-center gap-1 rounded-full bg-violet-50 px-2 py-1 text-xs font-medium text-violet-700 ring-1 ring-inset ring-violet-600/20', className)}><Tag aria-hidden className="size-3" />{name}</span>;
}
