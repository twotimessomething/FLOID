import { useRef, useCallback, useEffect, useState } from 'react';

interface DragHandleProps {
  readonly edge: 'start' | 'end';
  readonly onDragStart: (e: React.MouseEvent) => void;
  readonly onDrag: (deltaX: number) => void;
  readonly onDragEnd: () => void;
  readonly label?: string;
  readonly dragDate?: string;
  readonly color?: string;
}

export default function DragHandle({
  edge,
  onDragStart,
  onDrag,
  onDragEnd,
  label,
  dragDate,
  color,
}: DragHandleProps): JSX.Element {
  const isDragging = useRef(false);
  const lastX = useRef(0);
  const [showBubble, setShowBubble] = useState(false);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      isDragging.current = true;
      lastX.current = e.clientX;
      setShowBubble(true);
      onDragStart(e);
      document.body.classList.add('no-select');
    },
    [onDragStart]
  );

  // Prevent click from bubbling to parent after drag
  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      const deltaX = e.clientX - lastX.current;
      lastX.current = e.clientX;
      onDrag(deltaX);
    };

    const handleMouseUp = () => {
      if (!isDragging.current) return;
      isDragging.current = false;
      setShowBubble(false);
      onDragEnd();
      document.body.classList.remove('no-select');
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [onDrag, onDragEnd]);

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
      {showBubble && dragDate && (
        <div
          className={`absolute bottom-full mb-2 px-2 py-1 bg-[var(--color-tooltip)] text-white text-xs font-medium rounded shadow-lg whitespace-nowrap z-50 pointer-events-none ${
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
        className={`absolute top-1/2 -translate-y-1/2 w-1 h-4 rounded ${
          edge === 'start' ? 'left-0.5' : 'right-0.5'
        }`}
        style={{ backgroundColor: color ?? 'rgba(255, 255, 255, 0.5)' }}
        aria-hidden="true"
      />
    </div>
  );
}
