/** How much paper the axis dissolves content into. */
const FADE_HEIGHT_PX = 16;

/** Masked rather than blended, so the ground stays exactly the ground. */
const FADE_MASK = 'linear-gradient(to bottom, #000 0%, rgba(0, 0, 0, 0) 100%)';

interface ScrollEdgeFadeProps {
  /** Distance from the top of the timeline area to the foot of the axis. */
  readonly top: number;
  /** Only once there is something above to fade — an unscrolled sheet has none. */
  readonly isVisible: boolean;
}

/**
 * Where rows meet the date axis.
 *
 * The axis is opaque paper laid over the sheet, so without this a bar scrolling
 * under it is guillotined — a hard horizontal edge across the one surface the
 * whole design insists is continuous. A short wash of the ground lets rows
 * dissolve into it instead. It is the ground, not a scrim: nothing is tinted,
 * nothing is blurred, and on an unscrolled sheet it is not there at all.
 *
 * It lives outside the scroll container, over both columns at once, so it stays
 * put while the sheet moves under it — including past the ends, where the
 * columns themselves are travelling.
 */
export function ScrollEdgeFade({ top, isVisible }: ScrollEdgeFadeProps): JSX.Element {
  return (
    <div
      className="absolute left-0 right-0 z-30 pointer-events-none bg-[var(--color-background)] transition-opacity duration-base ease-out"
      style={{
        top,
        height: FADE_HEIGHT_PX,
        opacity: isVisible ? 1 : 0,
        maskImage: FADE_MASK,
        WebkitMaskImage: FADE_MASK,
      }}
      aria-hidden="true"
    />
  );
}
