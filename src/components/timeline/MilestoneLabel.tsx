import type { LabelPlacement } from '../../utils/labelLayoutUtils';

interface MilestoneLabelProps {
  readonly name: string;
  readonly placement?: LabelPlacement;
  /** Show the label even when its placement is hidden (e.g. selection). */
  readonly forceVisible?: boolean;
}

const DEFAULT_PLACEMENT: LabelPlacement = { isHidden: false, offsetX: 0 };

/**
 * Milestone label pill below the marker. Placement comes from layoutLabels:
 * centered under the diamond with a small collision nudge, or hidden —
 * kept in the DOM and revealed centered on group hover.
 * Parent must be positioned at the diamond and carry the `group` class.
 */
export function MilestoneLabel({
  name,
  placement = DEFAULT_PLACEMENT,
  forceVisible = false,
}: MilestoneLabelProps): JSX.Element {
  const isHoverReveal = placement.isHidden && !forceVisible;

  return (
    <div
      className={`absolute top-full left-1/2 -translate-x-1/2 -mt-2 px-2 py-0.5 bg-[var(--color-surface)]/90 backdrop-blur-[2px] text-[var(--color-text-primary)] text-xs rounded-md whitespace-nowrap pointer-events-none border border-[var(--color-border)] ${
        isHoverReveal
          ? 'opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-hover:shadow-md'
          : ''
      }`}
      style={placement.offsetX !== 0 ? { marginLeft: placement.offsetX } : undefined}
      role="tooltip"
    >
      {name}
    </div>
  );
}
