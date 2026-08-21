import { useRef, useCallback, useEffect, useState } from 'react';

interface DragHandleProps {
  readonly edge: 'start' | 'end';
  readonly onDragStart: (edge: 'start' | 'end') => void;
  readonly onDrag: (edge: 'start' | 'end', deltaX: number) => void;
  readonly onDragEnd: (edge: 'start' | 'end') => void;
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
 */
export function DragHandle({
  edge,
  onDragStart,
  onDrag,
  onDragEnd,
  label,
  dragDate,
}: DragHandleProps): JSX.Element {
  const [isDragging, setIsDragging] = useState(false);
  const lastX = useRef(0);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      e.preventDefault();
      lastX.current = e.clientX;
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

    const handleMouseMove = (e: MouseEvent): void => {
      const deltaX = e.clientX - lastX.current;
      lastX.current = e.clientX;
      onDrag(edge, deltaX);
    };

    const handleMouseUp = (): void => {
      setIsDragging(false);
      onDragEnd(edge);
      document.body.classList.remove('no-select');
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, onDrag, onDragEnd, edge]);

  // A resize interrupted by an unmount still has to put the page back
  useEffect(
    () => () => {
      document.body.classList.remove('no-select');
    },
    []
  );

  return (
    <div
      className={`absolute top-0 bottom-0 w-4 cursor-ew-resize drag-handle focus-ring z-20 pointer-events-auto ${
        edge === 'start' ? '-left-[10px]' : '-right-[10px]'
      }`}
      onMouseDown={handleMouseDown}
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
