import type { ButtonHTMLAttributes } from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly variant?: ButtonVariant;
  readonly size?: 'sm' | 'md';
}

const VARIANT_STYLES: Record<ButtonVariant, string> = {
  primary: 'bg-[var(--color-text-primary)] text-white hover:bg-gray-800 active:bg-gray-700',
  secondary: 'bg-[var(--color-background)] text-[var(--color-text-primary)] border border-[var(--color-border)] hover:bg-[var(--color-hover)] active:bg-[var(--color-active)]',
  danger: 'bg-red-600 text-white hover:bg-red-700 active:bg-red-800',
  ghost: 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-background)]',
};

const SIZE_STYLES = {
  sm: 'px-2 py-1 text-xs',
  md: 'px-3 py-1.5 text-sm',
};

export function Button({
  variant = 'secondary',
  size = 'md',
  className = '',
  disabled,
  children,
  ...props
}: ButtonProps): JSX.Element {
  const baseStyles = 'rounded-md font-medium transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-[var(--color-focus)] focus:ring-offset-1';
  const disabledStyles = disabled ? 'opacity-50 cursor-not-allowed' : '';

  return (
    <button
      className={`${baseStyles} ${VARIANT_STYLES[variant]} ${SIZE_STYLES[size]} ${disabledStyles} ${className}`}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
}
