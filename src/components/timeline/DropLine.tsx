interface DropLineProps {
  readonly position: 'top' | 'bottom';
  /**
   * Where the line starts, in px from the row's left edge. In the labels column
   * the indent is the depth the item will land at, which is the only way to
   * tell "the last child of this group" from "after the group" — both are the
   * same edge. On the sheet, across is time, so the line runs full width.
   */
  readonly inset?: number;
}

/**
 * Where a released item will land among its siblings. A single ink rule, the
 * same weight as the schedule hairline — the timeline says where, not how loud.
 * It fades in rather than appearing, so a line stepping from row to row under a
 * moving pointer reads as one line travelling, not as a flicker.
 */
export function DropLine({ position, inset = 0 }: DropLineProps): JSX.Element {
  return (
    <div
      className={`drop-line absolute right-0 h-0.5 bg-[var(--color-accent)] z-30 pointer-events-none ${
        position === 'top' ? 'top-0' : 'bottom-0'
      }`}
      style={{ left: inset }}
      aria-hidden="true"
    />
  );
}
