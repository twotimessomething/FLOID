interface ColorPickerProps {
  readonly label?: string;
  readonly value: string;
  readonly onChange: (color: string) => void;
  readonly colors?: readonly string[];
}

const DEFAULT_COLORS = [
  '#60a5fa', // blue
  '#34d399', // green
  '#a78bfa', // purple
  '#fbbf24', // amber
  '#f472b6', // pink
  '#f97316', // orange
  '#14b8a6', // teal
  '#8b5cf6', // violet
  '#ef4444', // red
  '#6b7280', // gray
] as const;

export function ColorPicker({
  label,
  value,
  onChange,
  colors = DEFAULT_COLORS,
}: ColorPickerProps): JSX.Element {
  return (
    <div className="flex flex-col gap-2">
      {label && (
        <span className="text-xs font-medium text-[#6b7280]">{label}</span>
      )}
      <div className="flex flex-wrap gap-1.5">
        {colors.map((color) => (
          <button
            key={color}
            type="button"
            onClick={() => onChange(color)}
            className={`w-6 h-6 rounded-full transition-transform duration-150 hover:scale-110 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-blue-500 ${
              value === color ? 'ring-2 ring-offset-1 ring-[#111827]' : ''
            }`}
            style={{ backgroundColor: color }}
            aria-label={`Select color ${color}`}
          />
        ))}
      </div>
    </div>
  );
}
