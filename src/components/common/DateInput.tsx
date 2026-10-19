import { useCallback, useState } from 'react';
import { format, parseISO } from 'date-fns';

/** Below this a typed year is still being typed. */
const MIN_TYPED_YEAR = 1900;

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

  // What the field shows while it is being typed in. A parent may decline a
  // half-typed date (an end before the start), and a controlled field that
  // snapped back to the stored value would wipe the keystroke mid-entry. The
  // draft holds only while the stored date is the one it was typed over: an
  // undo with the cursor still in the field shows the date it went back to.
  const stored = formatForInput(dateValue);
  const [draft, setDraft] = useState<{ readonly text: string; readonly over: string } | null>(
    null
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setDraft({ text: e.target.value, over: stored });
      const newDate = parseISO(e.target.value);
      // The native field reports every keystroke, so typing a year passes
      // through 0002, 0020 and 0202 on the way to 2027. Those are not dates
      // anyone means, and committing them would send the bar — and the whole
      // sheet's anchor — two thousand years away and back.
      if (!isNaN(newDate.getTime()) && newDate.getFullYear() >= MIN_TYPED_YEAR) {
        onChange(newDate);
      }
    },
    [onChange, stored]
  );

  // Leaving the field shows what was actually kept
  const handleBlur = useCallback(() => setDraft(null), []);

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
        value={draft !== null && draft.over === stored ? draft.text : stored}
        onChange={handleChange}
        onBlur={handleBlur}
        min={min ? formatForInput(min) : undefined}
        max={max ? formatForInput(max) : undefined}
        disabled={disabled}
        className="px-2 py-1.5 text-body bg-[var(--color-input-bg)] text-[var(--color-text-primary)] border border-[var(--color-border)] rounded-[var(--radius-sm)] transition-colors duration-fast focus:outline-none focus:border-[var(--color-focus)] disabled:bg-[var(--color-background)] disabled:text-[var(--color-text-muted)]"
      />
    </div>
  );
}
