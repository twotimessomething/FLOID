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
          className="text-xs font-medium text-[#6b7280]"
        >
          {label}
        </label>
      )}
      <textarea
        id={textareaId}
        className={`px-2 py-1.5 text-sm border border-[#e5e7eb] rounded-md transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none ${className}`}
        rows={3}
        {...props}
      />
    </div>
  );
}
