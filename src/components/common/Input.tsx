import { forwardRef, type InputHTMLAttributes } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  readonly label?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  function Input({ label, id, className = '', ...props }, ref): JSX.Element {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, '-');

    return (
      <div className="flex flex-col gap-1">
        {label && (
          <label
            htmlFor={inputId}
            className="text-xs font-medium text-[var(--color-text-secondary)]"
          >
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={`px-2 py-1.5 text-sm bg-[var(--color-input-bg)] text-[var(--color-text-primary)] border border-[var(--color-border)] rounded-md transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-[var(--color-focus)] focus:border-transparent ${className}`}
          {...props}
        />
      </div>
    );
  }
);
