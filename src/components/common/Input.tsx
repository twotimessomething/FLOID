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
            className="text-[11px] font-normal text-[var(--color-text-secondary)]"
          >
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={`px-2 py-1.5 text-sm bg-[var(--color-input-bg)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] border border-[var(--color-border)] rounded-[var(--radius-sm)] transition-colors duration-150 focus:outline-none focus:border-[var(--color-focus)] ${className}`}
          {...props}
        />
      </div>
    );
  }
);
