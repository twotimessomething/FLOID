import type { InputHTMLAttributes } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  readonly label?: string;
}

export function Input({ label, id, className = '', ...props }: InputProps): JSX.Element {
  const inputId = id || label?.toLowerCase().replace(/\s+/g, '-');

  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label
          htmlFor={inputId}
          className="text-xs font-medium text-[#6b7280]"
        >
          {label}
        </label>
      )}
      <input
        id={inputId}
        className={`px-2 py-1.5 text-sm border border-[#e5e7eb] rounded-md transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${className}`}
        {...props}
      />
    </div>
  );
}
