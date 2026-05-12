import * as React from 'react';
import { cn } from '@renderer/lib/cn';

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'default' | 'outline' | 'ghost';
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        'inline-flex items-center justify-center rounded-md px-3 py-2 text-sm font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none',
        variant === 'default' && 'bg-slate-900 text-white hover:bg-slate-700',
        variant === 'outline' && 'border border-slate-300 hover:bg-slate-50',
        variant === 'ghost' && 'hover:bg-slate-100',
        className
      )}
      {...props}
    />
  )
);
Button.displayName = 'Button';
