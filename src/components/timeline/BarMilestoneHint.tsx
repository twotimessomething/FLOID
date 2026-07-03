interface BarMilestoneHintProps {
  /** Cursor X in px, relative to the bar. */
  readonly x: number;
}

/**
 * Faint diamond pinned to a bar's top edge while hovering — hints that
 * double-click drops a milestone here, without disturbing the grab-to-move
 * cursor or affordance.
 */
export function BarMilestoneHint({ x }: BarMilestoneHintProps): JSX.Element {
  return (
    <div
      className="absolute -top-1 z-10 pointer-events-none"
      style={{ left: x }}
      aria-hidden="true"
    >
      <div className="w-2 h-2 -translate-x-1/2 rotate-45 bg-[var(--color-text-primary)] opacity-40" />
    </div>
  );
}
