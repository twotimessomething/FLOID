import { useCallback, useRef, useState } from 'react';
import { PALETTE_COLORS, MULTICOLOR_GRADIENT } from '../../constants/colors';
import { getReadableTextColor } from '../../utils/colorUtils';
import { CustomColorPopover } from './CustomColorPopover';

/** See `.color-swatch--selected` in index.css for why this is not an outline. */
const SELECTED_RING = 'color-swatch--selected';

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

/**
 * The palette, and a way off it.
 *
 * The inks come first in swatch order, then the two openings: the multicolor
 * gradient where a schedule can have one, and the `+` that opens the custom
 * picker. The `+` doubles as the custom swatch — once a colour that is not in
 * the palette is in play it prints that colour and takes the selection ring,
 * so the row still shows exactly one selected thing.
 */
export function ColorPicker({
  label,
  value,
  onChange,
  colors = PALETTE_COLORS,
  allowMulticolor = false,
  isMulticolor = false,
  onSelectMulticolor,
}: ColorPickerProps): JSX.Element {
  const customButtonRef = useRef<HTMLButtonElement>(null);
  const [isPickerOpen, setIsPickerOpen] = useState(false);

  const isCustom =
    !isMulticolor && !colors.some((color) => color.toLowerCase() === value.toLowerCase());

  const handleClosePicker = useCallback(() => setIsPickerOpen(false), []);
  const handleOpenPicker = useCallback(() => setIsPickerOpen((open) => !open), []);

  return (
    <div className="flex flex-col gap-2">
      {label && (
        <span className="text-meta font-normal text-[var(--color-text-secondary)]">{label}</span>
      )}
      {/* Six-pixel gutters, not eight: eight swatches to a row is what
          keeps both editors to two rows rather than orphaning a button on a
          third. The picker is a colour card — it wants to be tight. */}
      <div className="flex flex-wrap gap-1.5">
        {colors.map((color) => {
          const isSelected = !isMulticolor && !isCustom && value === color;
          return (
            <button
              key={color}
              type="button"
              onClick={() => onChange(color)}
              className={`w-6 h-6 rounded-[var(--radius-sm)] btn-press focus-ring ${
                isSelected ? SELECTED_RING : ''
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
              isMulticolor ? SELECTED_RING : ''
            }`}
            style={{ background: MULTICOLOR_GRADIENT }}
            title="Multicolor palette — each phase gets its own color"
            aria-label="Select multicolor palette"
            aria-pressed={isMulticolor}
          />
        )}
        <button
          ref={customButtonRef}
          type="button"
          onClick={handleOpenPicker}
          className={`w-6 h-6 flex items-center justify-center rounded-[var(--radius-sm)] btn-press focus-ring ${
            isCustom ? SELECTED_RING : 'border border-[var(--color-border)]'
          }`}
          style={isCustom ? { backgroundColor: value } : undefined}
          title="Custom color"
          aria-label="Choose a custom color"
          aria-haspopup="dialog"
          aria-expanded={isPickerOpen}
        >
          <PlusGlyph color={isCustom ? getReadableTextColor(value) : 'var(--color-text-muted)'} />
        </button>
      </div>
      {isPickerOpen && (
        <CustomColorPopover
          anchor={customButtonRef.current}
          value={value}
          onChange={onChange}
          onClose={handleClosePicker}
        />
      )}
    </div>
  );
}

function PlusGlyph({ color }: { readonly color: string }): JSX.Element {
  return (
    <svg viewBox="0 0 12 12" className="w-3 h-3" fill="none" aria-hidden="true">
      <path d="M6 2v8M2 6h8" stroke={color} strokeWidth="1.25" strokeLinecap="round" />
    </svg>
  );
}
