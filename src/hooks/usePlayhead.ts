import { useCallback, useEffect, useMemo, useRef } from 'react';
import { addDays } from 'date-fns';
import { useUIStore } from '../stores/uiStore';
import { getPositionFromRelative, getRelativeFromPosition } from '../utils/timelineUtils';
import { formatDate } from '../utils/dateUtils';
import type { ViewportBounds } from '../types';

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
      const x = clientX - rect.left + container.scrollLeft;

      const relative = getRelativeFromPosition(x, timelineWidth);
      const left = getPositionFromRelative(relative, timelineWidth);
      const date = addDays(
        viewportBounds.startDate,
        Math.round(relative * viewportBounds.totalDays)
      );

      return { left, relative, label: formatDate(date, 'MMM d, yyyy') };
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
