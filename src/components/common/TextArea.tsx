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
          className="text-meta font-normal text-[var(--color-text-secondary)]"
        >
          {label}
        </label>
      )}
      <textarea
        id={textareaId}
        className={`px-2 py-1.5 text-sm bg-[var(--color-input-bg)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] border border-[var(--color-border)] rounded-[var(--radius-sm)] transition-colors duration-fast focus:outline-none focus:border-[var(--color-focus)] resize-none ${className}`}
        rows={3}
        {...props}
      />
    </div>
  );
}
