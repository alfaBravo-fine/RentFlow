import React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
}

export const Button: React.FC<ButtonProps> = ({
  children,
  className,
  variant = 'primary',
  size = 'md',
  disabled,
  ...props
}) => {
  const baseClasses =
    'inline-flex items-center justify-center font-medium transition-colors focus-ring rounded-[6px] disabled:opacity-50 disabled:pointer-events-none cursor-pointer';

  const variantClasses = {
    primary: 'bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white shadow-xs',
    secondary: 'bg-[var(--surface)] hover:bg-[var(--border)] text-[var(--text)] border border-[var(--border)]',
    outline: 'border border-[var(--border-strong)] bg-transparent hover:bg-[var(--surface)] text-[var(--text)]',
    danger: 'bg-[var(--status-danger-fg)] hover:opacity-90 text-white',
    ghost: 'bg-transparent hover:bg-[var(--surface)] text-[var(--text)]',
  };

  const sizeClasses = {
    sm: 'text-xs px-2.5 py-1.5 h-8 gap-1.5',
    md: 'text-sm px-3.5 py-2 h-9 gap-2',
    lg: 'text-base px-4 py-2.5 h-11 gap-2.5',
  };

  return (
    <button
      className={twMerge(clsx(baseClasses, variantClasses[variant], sizeClasses[size], className))}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
};
