import React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, className, ...props }, ref) => {
    return (
      <div className="w-full space-y-1.5">
        {label && <label className="block text-xs font-medium text-[var(--text-muted)]">{label}</label>}
        <input
          ref={ref}
          className={twMerge(
            clsx(
              'w-full h-9 rounded-[6px] border border-[var(--border)] bg-[var(--bg)] px-3 py-1.5 text-sm text-[var(--text)] placeholder-[var(--text-subtle)] focus-ring transition-colors disabled:opacity-50',
              error && 'border-[var(--status-danger-fg)]',
              className
            )
          )}
          {...props}
        />
        {error && <p className="text-xs text-[var(--status-danger-fg)]">{error}</p>}
      </div>
    );
  }
);

Input.displayName = 'Input';
