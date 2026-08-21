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
        <span className="text-meta font-normal text-[var(--color-text-secondary)]">{label}</span>
      )}
      <div className="flex flex-wrap gap-2">
        {colors.map((color) => {
          const isSelected = !isMulticolor && value === color;
          return (
            <button
              key={color}
              type="button"
              onClick={() => onChange(color)}
              className={`w-6 h-6 rounded-[var(--radius-sm)] btn-press focus-ring ${
                isSelected ? 'outline outline-[1.5px] outline-offset-2 outline-[var(--color-text-primary)]' : ''
              }`}
              style={{ backgroundColor: color }}
              aria-label={`Select color ${color}`}
              aria-pressed={isSelected}
            />
          );
        })}
        {allowMulticolor && (
          <button
            type="button"
            onClick={onSelectMulticolor}
            className={`w-6 h-6 rounded-[var(--radius-sm)] btn-press focus-ring ${
              isMulticolor ? 'outline outline-[1.5px] outline-offset-2 outline-[var(--color-text-primary)]' : ''
            }`}
            style={{ background: MULTICOLOR_GRADIENT }}
            title="Multicolor palette — each phase gets its own color"
            aria-label="Select multicolor palette"
            aria-pressed={isMulticolor}
          />
        )}
      </div>
    </div>
  );
}
