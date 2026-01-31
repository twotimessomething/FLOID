import type { ButtonHTMLAttributes } from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly variant?: ButtonVariant;
  readonly size?: 'sm' | 'md';
}

const VARIANT_STYLES: Record<ButtonVariant, string> = {
  primary: 'bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800',
  secondary: 'bg-gray-100 text-gray-700 hover:bg-gray-200 active:bg-gray-300',
  danger: 'bg-red-600 text-white hover:bg-red-700 active:bg-red-800',
  ghost: 'text-gray-600 hover:text-gray-900 hover:bg-gray-100',
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
  const baseStyles = 'rounded font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1';
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
