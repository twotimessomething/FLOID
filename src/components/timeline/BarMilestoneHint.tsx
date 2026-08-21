import { getReadableTextColor } from '../../utils/colorUtils';

interface BarMilestoneHintProps {
  /** Cursor X in px, relative to the bar. */
  readonly x: number;
  /** The bar's own color, used to keep the glyph legible against it. */
  readonly color: string;
}

/**
 * Faint diamond pinned to a bar's top edge while hovering — hints that
 * double-click drops a milestone here, without disturbing the grab-to-move
 * cursor or affordance.
 */
export function BarMilestoneHint({ x, color }: BarMilestoneHintProps): JSX.Element {
  const glyphColor = getReadableTextColor(color);

  return (
    <div
      className="absolute -top-1 z-10 pointer-events-none"
      style={{ left: x }}
      aria-hidden="true"
    >
      <div
        className="w-2 h-2 -translate-x-1/2 rotate-45 opacity-40"
        style={{ backgroundColor: glyphColor }}
      />
    </div>
  );
}
