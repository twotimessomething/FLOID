interface PinBadgeProps {
  readonly size?: 'sm' | 'md';
}

/**
 * Minimal indicator for the pinned schedule — an outline text chip, not a
 * filled badge. Position (top of the timeline) already carries most of the
 * meaning; this is just a small confirmation, not the loudest thing on screen.
 */
export function PinBadge({ size = 'sm' }: PinBadgeProps): JSX.Element {
  const paddingClass = size === 'sm' ? 'px-1 py-px' : 'px-1.5 py-0.5';

  return (
    <span
      className={`eyebrow inline-flex items-center flex-shrink-0 ${paddingClass} border border-[var(--color-text-muted)] rounded-[var(--radius-sm)]`}
      title="Pinned to top"
    >
      Pinned
    </span>
  );
}
