import { useCallback, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import type { TimelineItem, ViewportBounds } from '../types';
import { useSectionStore } from '../stores/sectionStore';
import { useUIStore } from '../stores/uiStore';
import {
  addDaysToKey,
  dayKeyDiff,
  snapEndToBusinessDay,
  snapKeyToBusinessDay,
  type DaySpan,
} from '../utils/dayKeys';
import { describeDrawnSpan } from '../utils/creationUtils';
import { getBarRect, MIN_BAR_WIDTH, type BarRect } from '../utils/timelineUtils';
import { EASE_OUT_CSS, prefersReducedMotion } from '../utils/easing';
import { finishDragMotion } from '../utils/dragCluster';
import { DATE_DEAD_ZONE_PX } from './useItemDrag';

type Edge = 'start' | 'end';

/** The dates a resize is currently showing, and which edge is doing it. */
interface ResizeState {
  readonly edge: Edge;
  readonly start: string;
  readonly end: string;
  /** How far the grabbed edge has travelled, in px, held to the one-day floor. */
  readonly offsetPx: number;
}

/** Where the resize began, plus what it has most recently shown. */
interface ResizeOrigin {
  readonly start: string;
  readonly end: string;
  latest: ResizeState;
}

/**
 * The span a resize shows once the grabbed edge has travelled `travelPx`.
 *
 * A few pixels are a hand settling, not a choice of date: at a quarter's zoom
 * a day is two pixels, and without the dead zone a press that wobbled on its
 * way up rewrote the bar — an undo step and a revision for nothing. Past it,
 * the edge is over whichever day is nearest, and never within a day of the
 * other edge.
 */
export function resizedSpan(
  origin: DaySpan,
  edge: Edge,
  travelPx: number,
  pixelsPerDay: number
): DaySpan {
  const days =
    pixelsPerDay <= 0 || Math.abs(travelPx) < DATE_DEAD_ZONE_PX
      ? 0
      : Math.round(travelPx / pixelsPerDay);
  if (edge === 'start') {
    const start = addDaysToKey(origin.start, days);
    return {
      start: dayKeyDiff(start, origin.end) < 1 ? addDaysToKey(origin.end, -1) : start,
      end: origin.end,
    };
  }
  const end = addDaysToKey(origin.end, days);
  return {
    start: origin.start,
    end: dayKeyDiff(origin.start, end) < 1 ? addDaysToKey(origin.start, 1) : end,
  };
}

/**
 * What the bubble on a moving edge says: the day that edge lands on, and how
 * long that leaves the bar — the same words, in the same order, a drawn span
 * reads out.
 */
export function describeResize(span: DaySpan, edge: Edge): string {
  const readout = describeDrawnSpan(span.start, span.end);
  return `${edge === 'start' ? readout.start : readout.end} · ${readout.duration}`;
}

/** The edge easing onto its day. `--duration-fast`: a state changing, not a surface. */
const RESIZE_SETTLE_MS = 120;

/**
 * Links are drawn from the store, which a resize does not write until it is
 * let go — so for the length of one, a link at the moving edge would point at
 * where the edge was. The ink steps aside while an edge is in the hand and
 * comes back once it has eased onto its day.
 */
const RESIZING_CLASS = 'resizing-bar';
let quietTimer: number | null = null;

function quietLinks(): void {
  if (quietTimer !== null) window.clearTimeout(quietTimer);
  quietTimer = null;
  document.body.classList.add(RESIZING_CLASS);
}

function releaseLinks(afterMs: number): void {
  if (quietTimer !== null) window.clearTimeout(quietTimer);
  quietTimer = window.setTimeout(() => {
    quietTimer = null;
    document.body.classList.remove(RESIZING_CLASS);
  }, afterMs);
}

interface UseBarResizeArgs {
  readonly item: TimelineItem;
  readonly sectionId: string;
  readonly isLocked: boolean;
  readonly viewport: ViewportBounds;
  readonly pixelsPerDay: number;
  readonly skipWeekends: boolean;
  readonly barRef: React.RefObject<HTMLElement>;
  /** Set once a resize ends, so the click it releases into stands down. */
  readonly hasDraggedRef: React.MutableRefObject<boolean>;
}

interface UseBarResizeResult {
  /** The bar's rect: its own dates at rest, the edge under the pointer mid-resize. */
  readonly rect: BarRect;
  readonly startBubble: string | undefined;
  readonly endBubble: string | undefined;
  readonly handleResizeStart: (edge: Edge) => void;
  /** `travelPx`: how far the edge has come since the press, scrolling included. */
  readonly handleResize: (edge: Edge, travelPx: number) => void;
  readonly handleResizeEnd: () => void;
  readonly handleResizeCancel: () => void;
}

/**
 * Resizing a bar by one edge.
 *
 * Resizing is the same bargain dragging already struck: show it, then write it
 * once. Holding the candidate dates here means a move costs this row and
 * nothing else, undo gets a single step without a transaction to collapse one,
 * and Escape is free — there is nothing written to take back.
 *
 * The edge follows the pointer exactly, not day by day. At a day's zoom a day
 * is forty pixels, and an edge that only moved in forty-pixel steps read as
 * the bar lurching after the hand rather than being held by it. The bubble
 * says which day the edge is over; letting go eases the edge onto that day,
 * the same small settle a drop makes.
 *
 * Travel arrives whole from the handle — pointer and scroll together — so a
 * sheet that scrolls under a still pointer carries the edge with it.
 */
export function useBarResize({
  item,
  sectionId,
  isLocked,
  viewport,
  pixelsPerDay,
  skipWeekends,
  barRef,
  hasDraggedRef,
}: UseBarResizeArgs): UseBarResizeResult {
  const setItemDates = useSectionStore((s) => s.setItemDates);
  const setDragging = useUIStore((s) => s.setDragging);

  const [resize, setResize] = useState<ResizeState | null>(null);
  const resizeOrigin = useRef<ResizeOrigin | null>(null);

  // "Skip weekends" belongs to the commit, not the gesture, and only to the
  // edge that was grabbed: the other one was not chosen just now, so a start
  // that already sits on a Saturday stays there while the end is dragged. A
  // start squares up forward, an end back to Friday — unless squaring up would
  // leave no bar at all, in which case the dragged dates stand.
  const landingSpan = useCallback(
    (span: ResizeState): DaySpan => {
      if (!skipWeekends) return span;
      const snapped =
        span.edge === 'start'
          ? { start: snapKeyToBusinessDay(span.start), end: span.end }
          : { start: span.start, end: snapEndToBusinessDay(span.end) };
      return dayKeyDiff(snapped.start, snapped.end) < 1 ? span : snapped;
    },
    [skipWeekends]
  );

  // Nothing is written mid-resize, so the item still holds the dates the
  // resize began from: the bar is those, with the grabbed edge moved.
  const rect = useMemo((): BarRect => {
    const base = getBarRect(item, viewport, pixelsPerDay);
    if (!resize) return base;
    return resize.edge === 'end'
      ? { left: base.left, width: base.width + resize.offsetPx }
      : { left: base.left + resize.offsetPx, width: base.width - resize.offsetPx };
  }, [item, resize, viewport, pixelsPerDay]);

  /**
   * Ease the bar from where the hand left it to where the dates put it. The
   * commit has already happened — `flushSync` makes sure of that — so this is
   * only the picture catching up.
   */
  const glide = useCallback(
    (commit: () => void): void => {
      const bar = barRef.current;
      const from = bar ? { left: bar.offsetLeft, width: bar.offsetWidth } : null;
      flushSync(commit);
      releaseLinks(prefersReducedMotion() ? 0 : RESIZE_SETTLE_MS);
      if (!bar || !from || !bar.isConnected || typeof bar.animate !== 'function') return;
      if (prefersReducedMotion()) return;
      const to = { left: bar.offsetLeft, width: bar.offsetWidth };
      if (Math.abs(to.left - from.left) < 0.5 && Math.abs(to.width - from.width) < 0.5) return;
      bar.animate(
        [
          { left: `${from.left}px`, width: `${from.width}px` },
          { left: `${to.left}px`, width: `${to.width}px` },
        ],
        { duration: RESIZE_SETTLE_MS, easing: EASE_OUT_CSS }
      );
    },
    [barRef]
  );

  const handleResizeStart = useCallback(
    (edge: Edge): void => {
      if (isLocked) return;
      finishDragMotion();
      quietLinks();
      setDragging(true, edge === 'start' ? 'resize-start' : 'resize-end');
      const initial: ResizeState = { edge, start: item.start, end: item.end, offsetPx: 0 };
      resizeOrigin.current = { start: item.start, end: item.end, latest: initial };
      setResize(initial);
    },
    [isLocked, setDragging, item.start, item.end]
  );

  const handleResize = useCallback(
    (edge: Edge, travelPx: number): void => {
      const origin = resizeOrigin.current;
      if (!origin || pixelsPerDay <= 0) return;

      // One day is the floor, in pixels as in dates: an edge never crosses the
      // other one, and never brings the bar thinner than a grabbable sliver.
      const width = getBarRect(
        { ...item, start: origin.start, end: origin.end },
        viewport,
        pixelsPerDay
      ).width;
      const floor = Math.max(pixelsPerDay, MIN_BAR_WIDTH);
      const offsetPx =
        edge === 'end' ? Math.max(floor - width, travelPx) : Math.min(width - floor, travelPx);

      const { start, end } = resizedSpan(origin, edge, travelPx, pixelsPerDay);

      const previous = origin.latest;
      if (previous.offsetPx === offsetPx && previous.start === start && previous.end === end)
        return;
      origin.latest = { edge, start, end, offsetPx };
      setResize(origin.latest);
    },
    [item, viewport, pixelsPerDay]
  );

  const handleResizeEnd = useCallback((): void => {
    const origin = resizeOrigin.current;
    resizeOrigin.current = null;
    setDragging(false);
    hasDraggedRef.current = true;

    glide(() => {
      setResize(null);
      if (!origin) return;
      const { latest } = origin;
      if (latest.start === origin.start && latest.end === origin.end) return;

      const { start, end } = landingSpan(latest);
      setItemDates(sectionId, item.id, start, end);
    });
  }, [setDragging, hasDraggedRef, glide, landingSpan, setItemDates, sectionId, item.id]);

  /** Escape, or a gesture the browser took back. The edge eases home. */
  const handleResizeCancel = useCallback((): void => {
    resizeOrigin.current = null;
    setDragging(false);
    hasDraggedRef.current = true;
    glide(() => setResize(null));
  }, [setDragging, hasDraggedRef, glide]);

  // The day the edge will land on — after "skip weekends" — not the one under
  // the pointer, so a weekend never promises what the drop squares up to a
  // weekday. The end edge reads as the bar's last day, the day before it.
  const landed = resize ? landingSpan(resize) : null;
  const startBubble =
    landed && resize?.edge === 'start' ? describeResize(landed, 'start') : undefined;
  const endBubble = landed && resize?.edge === 'end' ? describeResize(landed, 'end') : undefined;

  return {
    rect,
    startBubble,
    endBubble,
    handleResizeStart,
    handleResize,
    handleResizeEnd,
    handleResizeCancel,
  };
}
