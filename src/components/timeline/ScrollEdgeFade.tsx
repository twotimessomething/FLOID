import { EDGE_FADE_HEIGHT } from '../../utils/timelineUtils';

interface ScrollEdgeFadeProps {
  /** Distance from the top of the labels column to the foot of the held stack. */
  readonly top: number;
  /** Only once there is something above to fade — an unscrolled sheet has none. */
  readonly isVisible: boolean;
}

/**
 * Where the labels meet the date axis.
 *
 * The axis is opaque paper laid over the sheet, so without this a name
 * scrolling under it is guillotined — a hard horizontal edge across the one
 * surface the whole design insists is continuous. A short wash of the ground
 * lets rows dissolve into it instead. It is the ground, not a scrim: nothing is
 * tinted, nothing is blurred, and on an unscrolled sheet it is not there at all.
 *
 * The timeline column has verticals running through it and needs its wash laid
 * under them; `StickyEdgeFade` does that job on that side.
 */
export function ScrollEdgeFade({ top, isVisible }: ScrollEdgeFadeProps): JSX.Element {
  return (
    <div
      className="edge-fade absolute left-0 right-0 z-30 pointer-events-none bg-[var(--color-background)] transition-opacity duration-base ease-out"
      style={{ top, height: EDGE_FADE_HEIGHT, opacity: isVisible ? 1 : 0 }}
      aria-hidden="true"
    />
  );
}
