import { useRef, useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { edgeScrollSpeed, edgeScrollStep } from '../../hooks/useItemDrag';

interface DragHandleProps {
  readonly edge: 'start' | 'end';
  /** The bar's drawn width, which decides how much of it a handle may cover. */
  readonly barWidth: number;
  readonly onDragStart: (edge: 'start' | 'end') => void;
  /** `travelPx`: how far the edge has come since the press, scrolling included. */
  readonly onDrag: (edge: 'start' | 'end', travelPx: number) => void;
  readonly onDragEnd: (edge: 'start' | 'end') => void;
  /** Escape mid-resize, or a gesture the browser took back. Nothing commits. */
  readonly onDragCancel: (edge: 'start' | 'end') => void;
  readonly label?: string;
  readonly dragDate?: string;
}

/**
 * A handle reaches 6px into its bar and 10px out past it. A bar narrower than
 * this has no 6px to give at both ends and still leave something to move it
 * by — every one- or two-day bar at a month's zoom was all handle, and every
 * press on one resized it — so there both handles stand wholly outside, and
 * the whole bar is the move. The outer reach is the same either way, which is
 * what keeps the link dots standing clear just past it.
 */
const COMPACT_BAR_PX = 18;

/** On <body> for as long as an edge is in the hand: the cursor stays ew-resize. */
const RESIZING_EDGE_CLASS = 'resizing-edge';

interface HandleGesture {
  /** Where the press landed, on screen and on the sheet. */
  startX: number;
  startScrollLeft: number;
  pointerX: number;
  scroller: HTMLElement | null;
}

/**
 * One grabbable edge of a bar.
 *
 * The document listeners exist only while this particular edge is being
 * dragged. There is one of these on every side of every unlocked bar and the
 * timeline does not virtualise, so a pair kept alive per handle would put
 * hundreds of no-op handlers on the input path — and re-subscribe all of them
 * on every store write the drag itself causes.
 *
 * The callbacks take the edge back as an argument for the same reason: it lets
 * the row hand over the same three stable functions to both of its handles
 * rather than minting a closure per edge on every render.
 *
 * Pointer rather than mouse: the handle is a sliver of hit area that the
 * pointer leaves on the first frame of the gesture, so it captures the pointer
 * and keeps the rest of the drag addressed to itself — which is also what
 * makes the same grab work from a pen or a finger.
 *
 * It is a pointer affordance and stays out of the tab order: the keyboard
 * reaches the same dates through the editor, and a stop here could do nothing.
 */
export function DragHandle({
  edge,
  barWidth,
  onDragStart,
  onDrag,
  onDragEnd,
  onDragCancel,
  label,
  dragDate,
}: DragHandleProps): JSX.Element {
  const [isDragging, setIsDragging] = useState(false);
  const handleRef = useRef<HTMLDivElement>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const gesture = useRef<HandleGesture>({
    startX: 0,
    startScrollLeft: 0,
    pointerX: 0,
    scroller: null,
  });

  /**
   * The date rides the moving edge from <body>, as the move preview's does.
   * Inside the plot it could never rise above the axis or the schedules held
   * under it, and a bar in the top row would resize with its date hidden.
   * Placed from the bar's own rect, so it is wherever the edge is drawn.
   */
  const placeBubble = useCallback((): void => {
    const bubble = bubbleRef.current;
    const bar = handleRef.current?.parentElement;
    if (!bubble || !bar) return;
    const rect = bar.getBoundingClientRect();
    const x = edge === 'start' ? rect.left : rect.right;
    bubble.style.transform = `translate3d(${x}px, ${rect.top}px, 0) translate(-50%, -100%)`;
  }, [edge]);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent): void => {
      if (e.button !== 0) return;
      e.stopPropagation();
      e.preventDefault();
      const handle = e.currentTarget as HTMLElement;
      const scroller = handle.closest<HTMLElement>('.timeline-scroll-container');
      gesture.current = {
        startX: e.clientX,
        startScrollLeft: scroller?.scrollLeft ?? 0,
        pointerX: e.clientX,
        scroller,
      };
      handle.setPointerCapture?.(e.pointerId);
      setIsDragging(true);
      onDragStart(edge);
      document.body.classList.add('no-select', RESIZING_EDGE_CLASS);
    },
    [onDragStart, edge]
  );

  // Prevent click from bubbling to parent after drag
  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
  }, []);

  // Every render of a resize moves the edge; the bubble follows it there
  useLayoutEffect(() => {
    if (isDragging) placeBubble();
  });

  useEffect(() => {
    if (!isDragging) return;
    const session = gesture.current;
    const { scroller } = session;
    let frame: number | null = null;
    let frameAt: number | null = null;

    const finish = (): void => {
      setIsDragging(false);
      document.body.classList.remove('no-select', RESIZING_EDGE_CLASS);
    };

    // Travel is measured on the sheet, not the screen. Whatever scrolls under
    // a still pointer — the sheet following it past its edge, or two fingers
    // on a trackpad mid-resize — the edge has travelled too, and stays under it.
    const report = (): void => {
      const scrolled = scroller ? scroller.scrollLeft - session.startScrollLeft : 0;
      onDrag(edge, session.pointerX - session.startX + scrolled);
      placeBubble();
    };

    // Leaning on the sheet's edge scrolls it along, as it does for a move
    const edgeScrollTick = (now: number): void => {
      frame = null;
      if (!scroller) return;
      const speed = edgeScrollSpeed(scroller.getBoundingClientRect(), session.pointerX);
      if (speed === 0) {
        frameAt = null;
        return;
      }
      const before = scroller.scrollLeft;
      scroller.scrollLeft = before + edgeScrollStep(speed, frameAt === null ? null : now - frameAt);
      frameAt = now;
      if (scroller.scrollLeft !== before) report();
      frame = requestAnimationFrame(edgeScrollTick);
    };

    const handlePointerMove = (e: PointerEvent): void => {
      // The release happened somewhere the page never heard: call it off
      // rather than resize to wherever the hover wanders next
      if (e.buttons === 0) {
        finish();
        onDragCancel(edge);
        return;
      }
      session.pointerX = e.clientX;
      report();
      if (frame === null) frame = requestAnimationFrame(edgeScrollTick);
    };

    const handleScroll = (): void => report();

    const handlePointerUp = (): void => {
      finish();
      onDragEnd(edge);
    };

    const handlePointerCancel = (): void => {
      finish();
      onDragCancel(edge);
    };

    // A resize can be called off the same way a move can. The row is holding a
    // preview and has written nothing, so abandoning it costs a state reset.
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return;
      finish();
      onDragCancel(edge);
    };

    // Focus leaving the window takes the pointerup with it
    const handleBlur = (): void => {
      finish();
      onDragCancel(edge);
    };

    document.addEventListener('pointermove', handlePointerMove);
    document.addEventListener('pointerup', handlePointerUp);
    document.addEventListener('pointercancel', handlePointerCancel);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('blur', handleBlur);
    scroller?.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      if (frame !== null) cancelAnimationFrame(frame);
      document.removeEventListener('pointermove', handlePointerMove);
      document.removeEventListener('pointerup', handlePointerUp);
      document.removeEventListener('pointercancel', handlePointerCancel);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('blur', handleBlur);
      scroller?.removeEventListener('scroll', handleScroll);
    };
  }, [isDragging, onDrag, onDragEnd, onDragCancel, edge, placeBubble]);

  // A resize interrupted by an unmount still has to put the page back
  useEffect(
    () => () => {
      document.body.classList.remove('no-select', RESIZING_EDGE_CLASS);
    },
    []
  );

  const isCompact = barWidth < COMPACT_BAR_PX;

  return (
    <div
      ref={handleRef}
      className={`absolute top-0 bottom-0 ${
        isCompact ? 'w-[10px]' : 'w-4'
      } cursor-ew-resize drag-handle z-20 pointer-events-auto touch-none ${
        edge === 'start' ? '-left-[10px]' : '-right-[10px]'
      }`}
      onPointerDown={handlePointerDown}
      onClick={handleClick}
      role="slider"
      tabIndex={-1}
      aria-label={label ?? `Drag to resize ${edge}`}
      aria-orientation="horizontal"
    >
      {isDragging &&
        dragDate &&
        createPortal(
          <div
            ref={bubbleRef}
            className="date-chip date-chip--pointing resize-date-chip"
            aria-hidden="true"
          >
            {dragDate}
          </div>,
          document.body
        )}
      <div
        className={`absolute top-1/2 -translate-y-1/2 w-1 h-4 ${
          edge === 'start' ? 'left-0.5' : 'right-0.5'
        }`}
        style={{ backgroundColor: 'var(--color-text-primary)' }}
        aria-hidden="true"
      />
    </div>
  );
}
