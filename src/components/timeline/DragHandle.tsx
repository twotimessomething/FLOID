import { useRef, useCallback, useEffect, useState } from 'react';

interface DragHandleProps {
  readonly edge: 'start' | 'end';
  readonly onDragStart: (edge: 'start' | 'end') => void;
  readonly onDrag: (edge: 'start' | 'end', deltaX: number) => void;
  readonly onDragEnd: (edge: 'start' | 'end') => void;
  /** Escape mid-resize, or a gesture the browser took back. Nothing commits. */
  readonly onDragCancel: (edge: 'start' | 'end') => void;
  readonly label?: string;
  readonly dragDate?: string;
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
 * Pointer rather than mouse: the handle is four pixels of hit area that the
 * pointer leaves on the first frame of the gesture, so it captures the pointer
 * and keeps the rest of the drag addressed to itself — which is also what
 * makes the same grab work from a pen or a finger.
 */
export function DragHandle({
  edge,
  onDragStart,
  onDrag,
  onDragEnd,
  onDragCancel,
  label,
  dragDate,
}: DragHandleProps): JSX.Element {
  const [isDragging, setIsDragging] = useState(false);
  const lastX = useRef(0);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      e.preventDefault();
      lastX.current = e.clientX;
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
      setIsDragging(true);
      onDragStart(edge);
      document.body.classList.add('no-select');
    },
    [onDragStart, edge]
  );

  // Prevent click from bubbling to parent after drag
  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
  }, []);

  useEffect(() => {
    if (!isDragging) return;

    const finish = (): void => {
      setIsDragging(false);
      document.body.classList.remove('no-select');
    };

    const handlePointerMove = (e: PointerEvent): void => {
      const deltaX = e.clientX - lastX.current;
      lastX.current = e.clientX;
      onDrag(edge, deltaX);
    };

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

    document.addEventListener('pointermove', handlePointerMove);
    document.addEventListener('pointerup', handlePointerUp);
    document.addEventListener('pointercancel', handlePointerCancel);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('pointermove', handlePointerMove);
      document.removeEventListener('pointerup', handlePointerUp);
      document.removeEventListener('pointercancel', handlePointerCancel);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isDragging, onDrag, onDragEnd, onDragCancel, edge]);

  // A resize interrupted by an unmount still has to put the page back
  useEffect(
    () => () => {
      document.body.classList.remove('no-select');
    },
    []
  );

  return (
    <div
      className={`absolute top-0 bottom-0 w-4 cursor-ew-resize drag-handle focus-ring z-20 pointer-events-auto touch-none ${
        edge === 'start' ? '-left-[10px]' : '-right-[10px]'
      }`}
      onPointerDown={handlePointerDown}
      onClick={handleClick}
      role="slider"
      tabIndex={0}
      aria-label={label ?? `Drag to resize ${edge}`}
      aria-orientation="horizontal"
    >
      {/* Date bubble tooltip */}
      {isDragging && dragDate && (
        <div
          className={`absolute bottom-full mb-2 px-2 py-1 bg-[var(--color-tooltip)] text-[var(--color-tooltip-text)] text-xs rounded-[var(--radius-sm)] shadow-sm whitespace-nowrap z-50 pointer-events-none ${
            edge === 'start' ? 'left-0 -translate-x-1/2' : 'right-0 translate-x-1/2'
          }`}
          aria-hidden="true"
        >
          {dragDate}
          {/* Arrow */}
          <div
            className={`absolute top-full w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-[var(--color-tooltip)] ${
              edge === 'start' ? 'left-1/2 -translate-x-1/2' : 'right-1/2 translate-x-1/2'
            }`}
          />
        </div>
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
