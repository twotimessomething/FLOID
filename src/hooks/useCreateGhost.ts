import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useUIStore } from '../stores/uiStore';
import type { DrawnSpanReadout } from '../utils/creationUtils';
import { rubberBandOffset } from '../utils/rubberBand';

const DRAW_THRESHOLD_PX = 4;
const POST_DRAW_SUPPRESS_MS = 400;
/** Hover ghost appears only after the pointer has been still this long. */
const HOVER_STILL_DELAY_MS = 100;
/**
 * How far past the end of the sheet a draw can stretch, however hard it is
 * pulled. The resistance curve approaches its dimension and never passes it, so
 * this number is both the feel and the ceiling. It is small on purpose: the
 * release clamps to the sheet, and a ghost hanging half a screen past the last
 * day would be promising a bar that cannot be made.
 */
const EDGE_RESIST_PX = 56;

export interface CreateGhostState {
  /** Left edge in px, relative to the container. */
  readonly left: number;
  readonly width: number;
  /** Container-relative Y of the gesture (hover position, or draw anchor). */
  readonly offsetY: number;
  readonly isDrawing: boolean;
}

/**
 * The live readout hanging off a ghost being drawn. It is written to rather
 * than rendered for the same reason the geometry is: a draw reports sixty
 * times a second, and none of those frames should re-render a row.
 */
export interface CreateReadoutHandle {
  /** `width` is the ghost's drawn width in px — how much room the span has. */
  readonly show: (readout: DrawnSpanReadout, width: number) => void;
}

export interface CreateGestureInfo {
  readonly startPx: number;
  readonly endPx: number;
  readonly offsetY: number;
  readonly point: { readonly x: number; readonly y: number };
}

interface UseCreateGhostOptions {
  /** Ghost width in px while hovering — the default-size preview. */
  readonly defaultWidth: number;
  /** Horizontal px bounds (container-relative) the ghost and gestures clamp to. */
  readonly clampBounds?: { readonly min: number; readonly max: number };
  /** Which hovered elements count as empty space. Defaults to the container itself. */
  readonly isEligibleTarget?: (target: HTMLElement, container: HTMLElement) => boolean;
  readonly disabled?: boolean;
  /**
   * What the span between two px positions should say about itself. Omitted,
   * the draw stays silent.
   */
  readonly describeSpan?: (startPx: number, endPx: number) => DrawnSpanReadout;
  readonly onDoubleClickCreate: (info: CreateGestureInfo) => void;
  readonly onDrawCreate: (info: CreateGestureInfo) => void;
}

interface UseCreateGhostReturn {
  readonly ghost: CreateGhostState | null;
  /** Attach to the ghost element: a draw writes its geometry here directly. */
  readonly ghostRef: React.RefObject<HTMLDivElement>;
  /** Attach to the ghost's readout: a draw writes its dates here directly. */
  readonly readoutRef: React.RefObject<CreateReadoutHandle>;
  readonly handlePointerMove: (e: React.PointerEvent) => void;
  readonly handlePointerLeave: () => void;
  readonly handlePointerDown: (e: React.PointerEvent) => void;
  readonly handleDoubleClick: (e: React.MouseEvent) => void;
}

interface DrawState {
  rect: DOMRect;
  anchorClientX: number;
  anchorPx: number;
  offsetY: number;
  isDrawing: boolean;
  /** Latest pointer X, read by the frame that paints. */
  clientX: number;
  frame: number;
  cleanup: () => void;
}

/** Hovering is a mouse and pen idea; a finger on empty paper is a scroll. */
function isHoverPointer(pointerType: string): boolean {
  return pointerType !== 'touch';
}

/**
 * "The ghost is the system": hovering empty timeline space previews the item
 * that lives there; double-click commits it at default size; press-and-drag
 * draws it at an exact size.
 *
 * The draw itself never goes through React. A pointer reports sixty times a
 * second and the only thing that changes is two numbers on one element, so the
 * gesture writes them straight to the DOM on the display's own clock — the same
 * bargain `useItemDrag` strikes, so drawing a bar and dragging one cost the
 * same. React sees the ghost appear and sees it go; nothing in between.
 */
export function useCreateGhost({
  defaultWidth,
  clampBounds,
  isEligibleTarget,
  disabled,
  describeSpan,
  onDoubleClickCreate,
  onDrawCreate,
}: UseCreateGhostOptions): UseCreateGhostReturn {
  const [ghost, setGhost] = useState<CreateGhostState | null>(null);
  const ghostRef = useRef<HTMLDivElement>(null);
  const readoutRef = useRef<CreateReadoutHandle>(null);
  const drawStateRef = useRef<DrawState | null>(null);
  const suppressUntilRef = useRef(0);
  const hoverTimerRef = useRef<number | null>(null);
  // Once the ghost has appeared it follows the cursor; the stillness delay
  // only gates its first appearance after entering empty space
  const isGhostVisibleRef = useRef(false);
  /** What the draw last painted, so a stray render can be corrected back to it. */
  const drawnGeometryRef = useRef<{ left: number; width: number } | null>(null);
  /** And what it last said, for the same reason. */
  const drawnReadoutRef = useRef<{ readout: DrawnSpanReadout; width: number } | null>(null);

  // Latest values for document-level listeners that outlive a render
  const latestRef = useRef({ defaultWidth, clampBounds, describeSpan, onDrawCreate });
  latestRef.current = { defaultWidth, clampBounds, describeSpan, onDrawCreate };

  const clearHoverTimer = useCallback((): void => {
    if (hoverTimerRef.current !== null) {
      window.clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
  }, []);

  // Abort a draw mid-gesture if the component unmounts
  useEffect(() => {
    return () => {
      drawStateRef.current?.cleanup();
      if (hoverTimerRef.current !== null) window.clearTimeout(hoverTimerRef.current);
    };
  }, []);

  const isEligible = useCallback(
    (target: HTMLElement, container: HTMLElement): boolean => {
      if (isEligibleTarget) return isEligibleTarget(target, container);
      return target === container;
    },
    [isEligibleTarget]
  );

  const bounds = useCallback((rectWidth: number): { min: number; max: number } => {
    const declared = latestRef.current.clampBounds;
    return {
      min: Math.max(0, declared?.min ?? 0),
      max: Math.min(rectWidth, declared?.max ?? rectWidth),
    };
  }, []);

  /** Where the gesture is allowed to end up. What gets committed. */
  const clampPx = useCallback(
    (px: number, rectWidth: number): number => {
      const { min, max } = bounds(rectWidth);
      return Math.max(min, Math.min(max, px));
    },
    [bounds]
  );

  /**
   * Where the gesture is allowed to *look*.
   *
   * Past the end of the sheet the ghost keeps answering, at a rate that falls
   * away to nothing — a wall reads as the app having stopped listening, while
   * resistance reads as there being no more paper. What the release commits is
   * still the clamped day: the sheet gives, the schedule does not.
   */
  const resistPx = useCallback(
    (px: number, rectWidth: number): number => {
      const { min, max } = bounds(rectWidth);
      if (px < min) return min + rubberBandOffset(px - min, EDGE_RESIST_PX);
      if (px > max) return max + rubberBandOffset(px - max, EDGE_RESIST_PX);
      return px;
    },
    [bounds]
  );

  /**
   * What the span being drawn would commit to, in words.
   *
   * It reads from the clamped day rather than the resisted one: pulled past
   * the end of the sheet the ghost keeps stretching, and the dates — which are
   * what the release actually makes — stand still.
   */
  const paintReadout = useCallback(
    (draw: DrawState, pointerPx: number, width: number): void => {
      const describe = latestRef.current.describeSpan;
      if (!describe) return;
      const currentPx = clampPx(pointerPx, draw.rect.width);
      const anchorPx = clampPx(draw.anchorPx, draw.rect.width);
      const readout = describe(
        Math.min(anchorPx, currentPx),
        Math.max(anchorPx, currentPx)
      );
      drawnReadoutRef.current = { readout, width };
      readoutRef.current?.show(readout, width);
    },
    [clampPx]
  );

  /** Write the drawn span onto the ghost element. Never through React. */
  const paintDraw = useCallback((): void => {
    const draw = drawStateRef.current;
    const element = ghostRef.current;
    if (!draw?.isDrawing) return;
    const pointerPx = draw.clientX - draw.rect.left;
    const currentPx = resistPx(pointerPx, draw.rect.width);
    const left = Math.min(draw.anchorPx, currentPx);
    const width = Math.abs(currentPx - draw.anchorPx);
    drawnGeometryRef.current = { left, width };
    paintReadout(draw, pointerPx, width);
    if (!element) return;
    element.style.left = `${left}px`;
    element.style.width = `${width}px`;
  }, [resistPx, paintReadout]);

  // A render landing mid-draw would repaint the ghost from the state it had
  // when the draw began. Putting the drawn geometry back costs one write — and
  // it is also how the readout gets its first words, since it mounts on the
  // render that turns the hover ghost into a drawn one.
  useLayoutEffect(() => {
    if (!drawStateRef.current?.isDrawing) return;
    const drawn = drawnGeometryRef.current;
    const element = ghostRef.current;
    if (drawn && element) {
      element.style.left = `${drawn.left}px`;
      element.style.width = `${drawn.width}px`;
    }
    const said = drawnReadoutRef.current;
    if (said) readoutRef.current?.show(said.readout, said.width);
  });

  const handlePointerMove = useCallback(
    (e: React.PointerEvent): void => {
      if (disabled || !isHoverPointer(e.pointerType)) return;
      // During a draw the document listener owns the ghost
      if (drawStateRef.current) return;
      const container = e.currentTarget as HTMLElement;
      if (e.buttons !== 0 || !isEligible(e.target as HTMLElement, container)) {
        clearHoverTimer();
        isGhostVisibleRef.current = false;
        setGhost((prev) => (prev !== null ? null : prev));
        return;
      }
      const rect = container.getBoundingClientRect();
      const min = Math.max(0, clampBounds?.min ?? 0);
      const max = Math.min(rect.width, clampBounds?.max ?? rect.width);
      if (max - min <= 0) {
        clearHoverTimer();
        isGhostVisibleRef.current = false;
        setGhost((prev) => (prev !== null ? null : prev));
        return;
      }
      // Ghost starts at the pointer and extends forward, shrinking against
      // the right bound — mirroring what creation will produce
      const x = clampPx(e.clientX - rect.left, rect.width);
      const next: CreateGhostState = {
        left: x,
        width: Math.min(defaultWidth, max - x),
        offsetY: e.clientY - rect.top,
        isDrawing: false,
      };
      if (isGhostVisibleRef.current) {
        // Already showing — track the cursor directly
        setGhost(next);
        return;
      }
      // First appearance waits for the pointer to settle
      clearHoverTimer();
      hoverTimerRef.current = window.setTimeout(() => {
        hoverTimerRef.current = null;
        if (drawStateRef.current) return;
        isGhostVisibleRef.current = true;
        setGhost(next);
      }, HOVER_STILL_DELAY_MS);
    },
    [disabled, isEligible, clampBounds, defaultWidth, clampPx, clearHoverTimer]
  );

  const handlePointerLeave = useCallback((): void => {
    clearHoverTimer();
    if (drawStateRef.current) return;
    isGhostVisibleRef.current = false;
    setGhost(null);
  }, [clearHoverTimer]);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent): void => {
      if (disabled || e.button !== 0 || drawStateRef.current) return;
      // A finger on empty paper moves the sheet. Drawing belongs to a device
      // that can rest on the page without meaning anything by it.
      if (!isHoverPointer(e.pointerType)) return;
      const container = e.currentTarget as HTMLElement;
      if (!isEligible(e.target as HTMLElement, container)) return;
      clearHoverTimer();

      // Stop text selection. The event still propagates — a press that never
      // travels is not a draw, and whatever else is listening may want it.
      e.preventDefault();

      const rect = container.getBoundingClientRect();

      const handleDocPointerMove = (me: PointerEvent): void => {
        const draw = drawStateRef.current;
        if (!draw) return;
        draw.clientX = me.clientX;
        if (!draw.isDrawing) {
          if (Math.abs(me.clientX - draw.anchorClientX) < DRAW_THRESHOLD_PX) return;
          draw.isDrawing = true;
          useUIStore.getState().setDragging(true, 'draw');
          document.body.classList.add('no-select');
          // The one render a draw costs: the ghost changing from a hover
          // preview into the span being drawn.
          setGhost({
            left: draw.anchorPx,
            width: 0,
            offsetY: draw.offsetY,
            isDrawing: true,
          });
        }
        if (draw.frame === 0) {
          draw.frame = requestAnimationFrame(() => {
            const live = drawStateRef.current;
            if (live) live.frame = 0;
            paintDraw();
          });
        }
      };

      const handleDocPointerUp = (me: PointerEvent): void => {
        const draw = drawStateRef.current;
        if (!draw) return;
        const wasDrawing = draw.isDrawing;
        draw.cleanup();
        if (!wasDrawing) return;

        suppressUntilRef.current = Date.now() + POST_DRAW_SUPPRESS_MS;
        isGhostVisibleRef.current = false;
        setGhost(null);
        const releasePx = clampPx(me.clientX - draw.rect.left, draw.rect.width);
        const anchorPx = clampPx(draw.anchorPx, draw.rect.width);
        latestRef.current.onDrawCreate({
          startPx: Math.min(anchorPx, releasePx),
          endPx: Math.max(anchorPx, releasePx),
          offsetY: draw.offsetY,
          point: { x: me.clientX, y: me.clientY },
        });
      };

      const handleDocPointerCancel = (): void => {
        const draw = drawStateRef.current;
        if (!draw) return;
        draw.cleanup();
        isGhostVisibleRef.current = false;
        setGhost(null);
      };

      const cleanup = (): void => {
        const draw = drawStateRef.current;
        const wasDrawing = draw?.isDrawing ?? false;
        if (draw && draw.frame !== 0) cancelAnimationFrame(draw.frame);
        drawStateRef.current = null;
        drawnGeometryRef.current = null;
        drawnReadoutRef.current = null;
        document.removeEventListener('pointermove', handleDocPointerMove);
        document.removeEventListener('pointerup', handleDocPointerUp);
        document.removeEventListener('pointercancel', handleDocPointerCancel);
        if (wasDrawing) {
          useUIStore.getState().setDragging(false);
          document.body.classList.remove('no-select');
        }
      };

      drawStateRef.current = {
        rect,
        anchorClientX: e.clientX,
        anchorPx: clampPx(e.clientX - rect.left, rect.width),
        offsetY: e.clientY - rect.top,
        isDrawing: false,
        clientX: e.clientX,
        frame: 0,
        cleanup,
      };

      document.addEventListener('pointermove', handleDocPointerMove);
      document.addEventListener('pointerup', handleDocPointerUp);
      document.addEventListener('pointercancel', handleDocPointerCancel);
    },
    [disabled, isEligible, clampPx, paintDraw, clearHoverTimer]
  );

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent): void => {
      if (disabled) return;
      // A just-finished draw can double-fire as a dblclick — swallow it
      if (Date.now() < suppressUntilRef.current) {
        e.stopPropagation();
        return;
      }
      const container = e.currentTarget as HTMLElement;
      if (!isEligible(e.target as HTMLElement, container)) return;
      e.stopPropagation();
      e.preventDefault();
      const rect = container.getBoundingClientRect();
      const clickPx = clampPx(e.clientX - rect.left, rect.width);
      onDoubleClickCreate({
        startPx: clickPx,
        endPx: clickPx,
        offsetY: e.clientY - rect.top,
        point: { x: e.clientX, y: e.clientY },
      });
    },
    [disabled, isEligible, clampPx, onDoubleClickCreate]
  );

  return {
    ghost,
    ghostRef,
    readoutRef,
    handlePointerMove,
    handlePointerLeave,
    handlePointerDown,
    handleDoubleClick,
  };
}
