import { forwardRef, type ButtonHTMLAttributes } from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly variant?: ButtonVariant;
  readonly size?: 'sm' | 'md';
}

const VARIANT_STYLES: Record<ButtonVariant, string> = {
  primary: 'bg-[var(--color-text-primary)] text-[var(--color-background)] hover:opacity-90 active:opacity-80',
  secondary: 'bg-[var(--color-raised)] text-[var(--color-text-primary)] border border-[var(--color-border)] hover:bg-[var(--color-hover)] active:bg-[var(--color-active)]',
  danger: 'bg-[var(--color-error)] text-white hover:opacity-90 active:opacity-80',
  ghost: 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-hover)]',
};

const SIZE_STYLES = {
  sm: 'px-2 py-1 text-xs',
  md: 'px-3 py-1.5 text-body',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', className = '', disabled, children, ...props },
  ref
) {
  const baseStyles = 'rounded-[var(--radius-sm)] font-medium btn-press focus-ring';
  const disabledStyles = disabled ? 'opacity-50 cursor-not-allowed' : '';

  return (
    <button
      ref={ref}
      className={`${baseStyles} ${VARIANT_STYLES[variant]} ${SIZE_STYLES[size]} ${disabledStyles} ${className}`}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
});
