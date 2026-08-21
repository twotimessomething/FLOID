import type { LabelPlacement } from '../../utils/labelLayoutUtils';

interface MilestoneLabelProps {
  readonly name: string;
  readonly placement?: LabelPlacement;
  /** Show the label even when its placement is hidden (e.g. selection). */
  readonly forceVisible?: boolean;
}

const DEFAULT_PLACEMENT: LabelPlacement = { isHidden: false, offsetX: 0 };

/**
 * Milestone label — plain ink sitting on the ground below the marker, no
 * chrome. Placement comes from layoutLabels: centered under the diamond
 * with a small collision nudge, or hidden — kept in the DOM and revealed
 * centered on group hover.
 *
 * It anchors to the bottom of the marker's row rather than below it, so the
 * text lands in the section header band's empty lower half instead of
 * colliding with the first phase bar underneath.
 *
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
      className={`absolute bottom-1 left-1/2 -translate-x-1/2 text-meta leading-none text-[var(--color-text-primary)] whitespace-nowrap pointer-events-none ${
        isHoverReveal ? 'opacity-0 transition-opacity duration-fast group-hover:opacity-100' : ''
      }`}
      style={placement.offsetX !== 0 ? { marginLeft: placement.offsetX } : undefined}
      role="tooltip"
    >
      {name}
    </div>
  );
}
