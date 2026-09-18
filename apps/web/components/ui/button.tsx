import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva('inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-medium shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-600 focus:ring-offset-2 disabled:pointer-events-none disabled:opacity-50', { variants: { variant: { primary: 'bg-brand-600 text-white hover:bg-brand-700', secondary: 'border border-surface-border bg-white text-slate-700 hover:bg-slate-50', danger: 'bg-rose-600 text-white hover:bg-rose-700', ghost: 'text-slate-700 hover:bg-slate-100' } }, defaultVariants: { variant: 'primary' } });
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {}
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, ...props }, ref) => <button ref={ref} className={cn(buttonVariants(), className)} {...props} />);
Button.displayName = 'Button';
