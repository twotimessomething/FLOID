import type { TextareaHTMLAttributes } from 'react';

interface TextAreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  readonly label?: string;
}

export function TextArea({ label, id, className = '', ...props }: TextAreaProps): JSX.Element {
  const textareaId = id || label?.toLowerCase().replace(/\s+/g, '-');

  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label
          htmlFor={textareaId}
          className="text-xs font-medium text-[var(--color-text-secondary)]"
        >
          {label}
        </label>
      )}
      <textarea
        id={textareaId}
        className={`px-2 py-1.5 text-sm bg-[var(--color-input-bg)] text-[var(--color-text-primary)] border border-[var(--color-border)] rounded-md transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-[var(--color-focus)] focus:border-transparent resize-none ${className}`}
        rows={3}
        {...props}
      />
    </div>
  );
}
