import React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'success' | 'warning' | 'danger' | 'info' | 'neutral';
}

export const Badge: React.FC<BadgeProps> = ({ children, className, variant = 'neutral', ...props }) => {
  const baseClasses =
    'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium border transition-colors';

  const variantClasses = {
    success: 'bg-[var(--status-success-bg)] text-[var(--status-success-fg)] border-transparent',
    warning: 'bg-[var(--status-warning-bg)] text-[var(--status-warning-fg)] border-transparent',
    danger: 'bg-[var(--status-danger-bg)] text-[var(--status-danger-fg)] border-transparent',
    info: 'bg-[var(--status-info-bg)] text-[var(--status-info-fg)] border-transparent',
    neutral: 'bg-[var(--surface)] text-[var(--text-muted)] border-[var(--border)]',
  };

  return (
    <span className={twMerge(clsx(baseClasses, variantClasses[variant], className))} {...props}>
      {children}
    </span>
  );
};
