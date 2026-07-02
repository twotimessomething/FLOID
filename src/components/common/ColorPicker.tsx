import { SCHEDULE_COLORS, MULTICOLOR_GRADIENT } from '../../constants/colors';

interface ColorPickerProps {
  readonly label?: string;
  readonly value: string;
  readonly onChange: (color: string) => void;
  readonly colors?: readonly string[];
  /** Show a multicolor palette swatch alongside the solid colors */
  readonly allowMulticolor?: boolean;
  readonly isMulticolor?: boolean;
  readonly onSelectMulticolor?: () => void;
}

export function ColorPicker({
  label,
  value,
  onChange,
  colors = SCHEDULE_COLORS,
  allowMulticolor = false,
  isMulticolor = false,
  onSelectMulticolor,
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
              !isMulticolor && value === color ? 'ring-2 ring-offset-1 ring-[var(--color-text-primary)]' : ''
            }`}
            style={{ backgroundColor: color }}
            aria-label={`Select color ${color}`}
          />
        ))}
        {allowMulticolor && (
          <button
            type="button"
            onClick={onSelectMulticolor}
            className={`w-6 h-6 rounded-full transition-transform duration-150 hover:scale-110 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-[var(--color-focus)] ${
              isMulticolor ? 'ring-2 ring-offset-1 ring-[var(--color-text-primary)]' : ''
            }`}
            style={{ background: MULTICOLOR_GRADIENT }}
            title="Multicolor palette — each phase gets its own color"
            aria-label="Select multicolor palette"
          />
        )}
      </div>
    </div>
  );
}
