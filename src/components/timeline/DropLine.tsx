interface DropLineProps {
  readonly position: 'top' | 'bottom';
}

/**
 * Where a released item will land among its siblings. A single ink rule, the
 * same weight as the schedule hairline — the timeline says where, not how loud.
 */
export function DropLine({ position }: DropLineProps): JSX.Element {
  return (
    <div
      className={`absolute left-0 right-0 h-0.5 bg-[var(--color-accent)] z-30 pointer-events-none ${
        position === 'top' ? 'top-0' : 'bottom-0'
      }`}
      aria-hidden="true"
    />
  );
}
