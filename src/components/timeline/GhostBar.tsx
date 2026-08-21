interface GhostBarProps {
  readonly left: number;
  readonly width: number;
  readonly color: string;
  /** Vertical placement classes; root rows by default. */
  readonly verticalClassName?: string;
  /** Explicit vertical placement where a row sets its own inset. */
  readonly style?: React.CSSProperties;
  /** True while the pointer is drawing the span; suppresses the grow-in. */
  readonly isDrawing?: boolean;
}

/**
 * Dashed-outline preview of the bar a create gesture would produce. Square
 * corners and a low-alpha fill in the row's colour read as an unfinished
 * sketch rather than a solid bar. Shared by every hover-ghost and drag-to-draw
 * surface so previews never drift from the real bars.
 *
 * It carries no text. On appearing it grows out of the pointer to its default
 * span — the drag it is asking for, performed once — so the outline teaches
 * the gesture instead of a caption doing it. A ghost that appears mid-draw is
 * already following the pointer, so it skips the animation rather than
 * fighting it.
 */
export function GhostBar({
  left,
  width,
  color,
  verticalClassName = 'top-2 bottom-2',
  style,
  isDrawing = false,
}: GhostBarProps): JSX.Element {
  return (
    <div
      className={`absolute ${verticalClassName} ${
        isDrawing ? '' : 'ghost-enter'
      } pointer-events-none border border-dashed`}
      style={{ left, width, borderColor: color, ...style }}
      aria-hidden="true"
    >
      <div className="absolute inset-0" style={{ backgroundColor: color, opacity: 0.16 }} />
    </div>
  );
}
