import { SCHEDULE_COLORS } from '../../constants/colors';

interface ColorPickerProps {
  readonly label?: string;
  readonly value: string;
  readonly onChange: (color: string) => void;
  readonly colors?: readonly string[];
}

export function ColorPicker({
  label,
  value,
  onChange,
  colors = SCHEDULE_COLORS,
}: ColorPickerProps): JSX.Element {
  return (
    <div className="flex flex-col gap-2">
      {label && (
        <span className="text-xs font-medium text-[var(--color-text-secondary)]">{label}</span>
      )}
      <div className="flex flex-wrap gap-1.5">
        {colors.map((color) => (
          <button
            key={color}
            type="button"
            onClick={() => onChange(color)}
            className={`w-6 h-6 rounded-full transition-transform duration-150 hover:scale-110 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-[var(--color-focus)] ${
              value === color ? 'ring-2 ring-offset-1 ring-[var(--color-text-primary)]' : ''
            }`}
            style={{ backgroundColor: color }}
            aria-label={`Select color ${color}`}
          />
        ))}
      </div>
    </div>
  );
}
