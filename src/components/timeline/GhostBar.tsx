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
 * Translucent preview of the bar a create gesture would produce. Shared by
 * every hover-ghost and drag-to-draw surface so previews never drift from
 * the real bars.
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
      className={`absolute ${verticalClassName} rounded-[10px] pointer-events-none flex items-center justify-center px-2 overflow-hidden`}
      style={{ left, width, backgroundColor: color, opacity: 0.3, ...style }}
      aria-hidden="true"
    >
      <span className="text-xs font-medium text-white truncate drop-shadow-sm">{label}</span>
    </div>
  );
}
