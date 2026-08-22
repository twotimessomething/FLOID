import { useCallback } from 'react';
import { format, parseISO } from 'date-fns';

interface DateInputProps {
  readonly label?: string;
  readonly value: Date | string;
  readonly onChange: (date: Date) => void;
  readonly min?: Date | string;
  readonly max?: Date | string;
  readonly disabled?: boolean;
}

export function DateInput({
  label,
  value,
  onChange,
  min,
  max,
  disabled = false,
}: DateInputProps): JSX.Element {
  const dateValue = typeof value === 'string' ? parseISO(value) : value;
  const inputId = label?.toLowerCase().replace(/\s+/g, '-');

  const formatForInput = (date: Date | string | undefined): string => {
    if (!date) return '';
    const d = typeof date === 'string' ? parseISO(date) : date;
    return format(d, 'yyyy-MM-dd');
  };

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newDate = parseISO(e.target.value);
      if (!isNaN(newDate.getTime())) {
        onChange(newDate);
      }
    },
    [onChange]
  );

  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label
          htmlFor={inputId}
          className="text-meta font-normal text-[var(--color-text-secondary)]"
        >
          {label}
        </label>
      )}
      <input
        id={inputId}
        type="date"
        value={formatForInput(dateValue)}
        onChange={handleChange}
        min={min ? formatForInput(min) : undefined}
        max={max ? formatForInput(max) : undefined}
        disabled={disabled}
        className="px-2 py-1.5 text-body bg-[var(--color-input-bg)] text-[var(--color-text-primary)] border border-[var(--color-border)] rounded-[var(--radius-sm)] transition-colors duration-fast focus:outline-none focus:border-[var(--color-focus)] disabled:bg-[var(--color-background)] disabled:text-[var(--color-text-muted)]"
      />
    </div>
  );
}
