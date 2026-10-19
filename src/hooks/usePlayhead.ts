import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useUIStore } from '../stores/uiStore';
import { READABLE_DAY_PX, getRelativeFromPosition } from '../utils/timelineUtils';
import { formatDayKey } from '../utils/dateUtils';
import { addDaysToKey } from '../utils/dayKeys';
import type { ViewportBounds } from '../types';

/**
 * From this scale up a day is wide enough to see which one the rule is on, so
 * the rule steps from day to day instead of gliding. Below it a day is a few
 * pixels, the step would read as judder, and the glide can never stand far
 * enough from the day it names to be misread.
 */
const SNAP_MIN_PIXELS_PER_DAY = READABLE_DAY_PX;

/** Where the ruler stands, and the day it is standing on. */
export interface PlayheadPoint {
  /** Pixels from the sheet's left edge — what both elements are moved by. */
  readonly left: number;
  /** The same point as a 0–1 fraction of the sheet. */
  readonly relative: number;
  readonly label: string;
}

/**
 * The two pieces the ruler is made of — the rule through the plot and the date
 * that hangs from the axis — plus the point they are drawn at.
 *
 * They travel as refs rather than props because the ruler follows the cursor:
 * a mousemove writes straight to these nodes, so React only ever sees the ruler
 * go up and come down. The same bargain the drag preview strikes.
 */
export interface PlayheadHandle {
  readonly lineRef: React.RefObject<HTMLDivElement>;
  readonly readoutRef: React.RefObject<HTMLDivElement>;
  readonly pointRef: React.MutableRefObject<PlayheadPoint | null>;
}

export interface PlayheadHoverProps {
  readonly onMouseMove: (e: React.MouseEvent) => void;
  readonly onMouseLeave: () => void;
}

interface UsePlayheadOptions {
  readonly timelineWidth: number;
  readonly viewportBounds: ViewportBounds;
  readonly containerRef: React.RefObject<HTMLDivElement>;
}

interface UsePlayheadReturn {
  /** Spread on the date axis — hovering it is the whole gesture. */
  readonly hoverProps: PlayheadHoverProps;
  readonly handle: PlayheadHandle;
}

/**
 * The ruler at sheet position `x`.
 *
 * It names the day whose boundary is nearest — the morning that day begins,
 * which is where the today line, a milestone, and a marker double-clicked
 * onto the sheet all stand — and, once days are wide enough to tell apart,
 * stands on that boundary itself. A rule left gliding between two boundaries
 * would sit in one day under the next one's name.
 */
export function playheadPointAt(
  x: number,
  timelineWidth: number,
  viewport: ViewportBounds
): PlayheadPoint {
  const pixelsPerDay = timelineWidth / viewport.totalDays;
  const onSheet = Math.max(0, Math.min(timelineWidth, x));
  const days = pixelsPerDay > 0 ? Math.round(onSheet / pixelsPerDay) : 0;
  const left = pixelsPerDay >= SNAP_MIN_PIXELS_PER_DAY ? days * pixelsPerDay : onSheet;
  return {
    left,
    relative: getRelativeFromPosition(left, timelineWidth),
    label: formatDayKey(addDaysToKey(viewport.startKey, days)),
  };
}

/**
 * Put the ruler where the cursor is.
 *
 * Called from the hook's own animation frame, and again by each element the
 * moment it mounts, so the first frame is already in the right place and React
 * never has to describe a position it would then have to keep up with.
 */
export function paintPlayhead(handle: PlayheadHandle): void {
  const point = handle.pointRef.current;
  if (!point) return;

  const line = handle.lineRef.current;
  if (line) line.style.transform = `translate3d(${point.left}px, 0, 0)`;

  const readout = handle.readoutRef.current;
  if (readout) {
    // The date reads centred on the rule, so it carries its own half-width back.
    readout.style.transform = `translate3d(${point.left}px, 0, 0) translateX(-50%)`;
    if (readout.textContent !== point.label) readout.textContent = point.label;
  }
}

/**
 * The date ruler.
 *
 * Hovering the axis raises a rule through every schedule and names the day it
 * lands on. There is nothing to press and nothing to learn — the axis is where
 * dates live, so reading one off it is the obvious thing to try.
 */
export function usePlayhead({
  timelineWidth,
  viewportBounds,
  containerRef,
}: UsePlayheadOptions): UsePlayheadReturn {
  const setPlayheadPosition = useUIStore((state) => state.setPlayheadPosition);

  const lineRef = useRef<HTMLDivElement>(null);
  const readoutRef = useRef<HTMLDivElement>(null);
  const pointRef = useRef<PlayheadPoint | null>(null);
  const handle = useMemo<PlayheadHandle>(
    () => ({ lineRef, readoutRef, pointRef }),
    [lineRef, readoutRef, pointRef]
  );

  const clientXRef = useRef<number | null>(null);
  const frameRef = useRef(0);

  const measure = useCallback(
    (clientX: number): PlayheadPoint | null => {
      const container = containerRef.current;
      if (!container) return null;

      // The sheet slides under a fixed viewport, so the day under the cursor is
      // its offset into the scrolled content — the window position alone would
      // name a different day the moment anything has been scrolled.
      const rect = container.getBoundingClientRect();
      return playheadPointAt(
        clientX - rect.left + container.scrollLeft,
        timelineWidth,
        viewportBounds
      );
    },
    [containerRef, timelineWidth, viewportBounds]
  );

  const paintFrame = useCallback((): void => {
    frameRef.current = 0;
    const clientX = clientXRef.current;
    if (clientX === null) return;
    const point = measure(clientX);
    if (!point) return;
    pointRef.current = point;
    paintPlayhead(handle);
  }, [measure, handle]);

  const schedulePaint = useCallback((): void => {
    if (frameRef.current === 0) frameRef.current = requestAnimationFrame(paintFrame);
  }, [paintFrame]);

  const cancelPaint = useCallback((): void => {
    if (frameRef.current === 0) return;
    cancelAnimationFrame(frameRef.current);
    frameRef.current = 0;
  }, []);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent): void => {
      clientXRef.current = e.clientX;

      if (useUIStore.getState().playheadPosition !== null) {
        schedulePaint();
        return;
      }

      // First contact. Measure before the ruler is raised so its opening frame
      // is already under the cursor; after that the position is the DOM's.
      const point = measure(e.clientX);
      if (!point) return;
      pointRef.current = point;
      setPlayheadPosition(point.relative);
    },
    [measure, schedulePaint, setPlayheadPosition]
  );

  const handleMouseLeave = useCallback((): void => {
    cancelPaint();
    clientXRef.current = null;
    pointRef.current = null;
    setPlayheadPosition(null);
  }, [cancelPaint, setPlayheadPosition]);

  /**
   * The sheet can move while the cursor holds still — a wheel across the axis,
   * or a pan's momentum still running out. The day under the cursor changes
   * with it, so a scroll repaints from the last position the cursor was at.
   */
  useEffect(() => {
    const handleScroll = (): void => {
      if (clientXRef.current === null) return;
      schedulePaint();
    };
    document.addEventListener('scroll', handleScroll, true);
    return () => document.removeEventListener('scroll', handleScroll, true);
  }, [schedulePaint]);

  useEffect(
    () => () => {
      cancelPaint();
      if (useUIStore.getState().playheadPosition !== null) {
        useUIStore.getState().setPlayheadPosition(null);
      }
    },
    [cancelPaint]
  );

  const hoverProps = useMemo<PlayheadHoverProps>(
    () => ({ onMouseMove: handleMouseMove, onMouseLeave: handleMouseLeave }),
    [handleMouseMove, handleMouseLeave]
  );

  return { hoverProps, handle };
}
