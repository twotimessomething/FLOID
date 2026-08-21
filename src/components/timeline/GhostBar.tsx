interface GhostBarProps {
  readonly left: number;
  readonly width: number;
  readonly color: string;
  readonly label: string;
  /** Vertical placement classes; phase rows by default. */
  readonly verticalClassName?: string;
  /** Explicit vertical placement for multi-row containers (task lists). */
  readonly style?: React.CSSProperties;
}

/**
 * Dashed-outline preview of the bar a create gesture would produce. Square
 * corners, a low-alpha fill in the phase color, and a muted label read as an
 * unfinished sketch rather than a solid bar. Shared by every hover-ghost and
 * drag-to-draw surface so previews never drift from the real bars.
 */
export function GhostBar({
  left,
  width,
  color,
  label,
  verticalClassName = 'top-2 bottom-2',
  style,
}: GhostBarProps): JSX.Element {
  return (
    <div
      className={`absolute ${verticalClassName} ghost-enter pointer-events-none overflow-hidden border border-dashed`}
      style={{ left, width, borderColor: color, ...style }}
      aria-hidden="true"
    >
      <div className="absolute inset-0" style={{ backgroundColor: color, opacity: 0.16 }} />
      <div className="relative h-full flex items-center justify-center px-2">
        <span className="text-[11px] text-[var(--color-text-muted)] truncate">{label}</span>
      </div>
    </div>
  );
}
