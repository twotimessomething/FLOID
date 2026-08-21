import { useCallback, useEffect, useRef, useState } from 'react';
import { useUIStore } from '../stores/uiStore';

const DRAW_THRESHOLD_PX = 4;
const POST_DRAW_SUPPRESS_MS = 400;
/** Hover ghost appears only after the mouse has been still this long. */
const HOVER_STILL_DELAY_MS = 100;

export interface CreateGhostState {
  /** Left edge in px, relative to the container. */
  readonly left: number;
  readonly width: number;
  /** Container-relative Y of the gesture (hover position, or draw anchor). */
  readonly offsetY: number;
  readonly isDrawing: boolean;
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
  readonly onDoubleClickCreate: (info: CreateGestureInfo) => void;
  readonly onDrawCreate: (info: CreateGestureInfo) => void;
}

interface UseCreateGhostReturn {
  readonly ghost: CreateGhostState | null;
  readonly handleMouseMove: (e: React.MouseEvent) => void;
  readonly handleMouseLeave: () => void;
  readonly handleMouseDown: (e: React.MouseEvent) => void;
  readonly handleDoubleClick: (e: React.MouseEvent) => void;
}

interface DrawState {
  rect: DOMRect;
  anchorClientX: number;
  anchorPx: number;
  offsetY: number;
  isDrawing: boolean;
  cleanup: () => void;
}

/**
 * "The ghost is the system": hovering empty timeline space previews the item
 * that lives there; double-click commits it at default size; press-and-drag
 * draws it at an exact size. Coordinates with the playhead — a hold that the
 * playhead claims first (visible scrubber) cancels the pending draw, and an
 * activated draw makes the playhead stand down via uiStore.isDragging.
 */
export function useCreateGhost({
  defaultWidth,
  clampBounds,
  isEligibleTarget,
  disabled,
  onDoubleClickCreate,
  onDrawCreate,
}: UseCreateGhostOptions): UseCreateGhostReturn {
  const [ghost, setGhost] = useState<CreateGhostState | null>(null);
  // A press the playhead has claimed is a date scrub, not a create
  const isPlayheadActive = useUIStore((s) => s.playheadPosition !== null);
  const drawStateRef = useRef<DrawState | null>(null);
  const suppressUntilRef = useRef(0);
  const hoverTimerRef = useRef<number | null>(null);
  // Once the ghost has appeared it follows the cursor; the stillness delay
  // only gates its first appearance after entering empty space
  const isGhostVisibleRef = useRef(false);

  // Latest values for document-level listeners that outlive a render
  const latestRef = useRef({ defaultWidth, clampBounds, onDrawCreate });
  latestRef.current = { defaultWidth, clampBounds, onDrawCreate };

  const clearHoverTimer = useCallback((): void => {
    if (hoverTimerRef.current !== null) {
      window.clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
  }, []);

  // Once the playhead is up the hold has been read as a date scrub, so the
  // create preview stands down — the two gestures never share the screen. It
  // stays down until the pointer moves again, which re-earns the hover ghost.
  useEffect(() => {
    if (!isPlayheadActive || drawStateRef.current?.isDrawing) return;
    clearHoverTimer();
    isGhostVisibleRef.current = false;
    setGhost((prev) => (prev !== null ? null : prev));
  }, [isPlayheadActive, clearHoverTimer]);

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

  const clampPx = useCallback((px: number, rectWidth: number): number => {
    const bounds = latestRef.current.clampBounds;
    const min = Math.max(0, bounds?.min ?? 0);
    const max = Math.min(rectWidth, bounds?.max ?? rectWidth);
    return Math.max(min, Math.min(max, px));
  }, []);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent): void => {
      if (disabled) return;
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
      // First appearance waits for the mouse to settle
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

  const handleMouseLeave = useCallback((): void => {
    clearHoverTimer();
    if (drawStateRef.current) return;
    isGhostVisibleRef.current = false;
    setGhost(null);
  }, [clearHoverTimer]);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent): void => {
      if (disabled || e.button !== 0 || drawStateRef.current) return;
      const container = e.currentTarget as HTMLElement;
      if (!isEligible(e.target as HTMLElement, container)) return;
      clearHoverTimer();

      // Stop text selection; let the event propagate so the playhead can
      // still win a motionless hold
      e.preventDefault();

      const rect = container.getBoundingClientRect();

      const handleDocMouseMove = (me: MouseEvent): void => {
        const draw = drawStateRef.current;
        if (!draw) return;
        if (!draw.isDrawing) {
          if (Math.abs(me.clientX - draw.anchorClientX) < DRAW_THRESHOLD_PX) return;
          // The playhead claimed this hold-and-drag first
          if (useUIStore.getState().playheadPosition !== null) {
            draw.cleanup();
            return;
          }
          draw.isDrawing = true;
          useUIStore.getState().setDragging(true, 'draw');
          document.body.classList.add('no-select');
        }
        const currentPx = clampPx(me.clientX - draw.rect.left, draw.rect.width);
        setGhost({
          left: Math.min(draw.anchorPx, currentPx),
          width: Math.abs(currentPx - draw.anchorPx),
          offsetY: draw.offsetY,
          isDrawing: true,
        });
      };

      const handleDocMouseUp = (me: MouseEvent): void => {
        const draw = drawStateRef.current;
        if (!draw) return;
        const wasDrawing = draw.isDrawing;
        draw.cleanup();
        if (!wasDrawing) return;

        suppressUntilRef.current = Date.now() + POST_DRAW_SUPPRESS_MS;
        isGhostVisibleRef.current = false;
        setGhost(null);
        const releasePx = clampPx(me.clientX - draw.rect.left, draw.rect.width);
        const startPx = Math.min(draw.anchorPx, releasePx);
        const endPx = Math.max(draw.anchorPx, releasePx);
        latestRef.current.onDrawCreate({
          startPx,
          endPx,
          offsetY: draw.offsetY,
          point: { x: me.clientX, y: me.clientY },
        });
      };

      const cleanup = (): void => {
        const wasDrawing = drawStateRef.current?.isDrawing ?? false;
        drawStateRef.current = null;
        document.removeEventListener('mousemove', handleDocMouseMove);
        document.removeEventListener('mouseup', handleDocMouseUp);
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
        cleanup,
      };

      document.addEventListener('mousemove', handleDocMouseMove);
      document.addEventListener('mouseup', handleDocMouseUp);
    },
    [disabled, isEligible, clampPx, clearHoverTimer]
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

  return { ghost, handleMouseMove, handleMouseLeave, handleMouseDown, handleDoubleClick };
}
