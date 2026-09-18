import * as React from 'react';
import { cn } from '@/lib/utils';

export const Card = React.forwardRef<HTMLElement, React.HTMLAttributes<HTMLElement>>(({ className, ...props }, ref) => <section ref={ref} className={cn('rounded-panel border border-surface-border bg-white p-6 shadow-panel', className)} {...props} />);
Card.displayName = 'Card';
