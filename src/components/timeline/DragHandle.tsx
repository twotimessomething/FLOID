import { useRef, useCallback, useEffect } from 'react';

interface DragHandleProps {
  readonly edge: 'start' | 'end';
  readonly onDragStart: () => void;
  readonly onDrag: (deltaX: number) => void;
  readonly onDragEnd: () => void;
  readonly label?: string;
}

export default function DragHandle({
  edge,
  onDragStart,
  onDrag,
  onDragEnd,
  label,
}: DragHandleProps): JSX.Element {
  const isDragging = useRef(false);
  const lastX = useRef(0);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      isDragging.current = true;
      lastX.current = e.clientX;
      onDragStart();
      document.body.classList.add('no-select');
    },
    [onDragStart]
  );

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
      className={`absolute top-0 bottom-0 w-2 cursor-ew-resize drag-handle focus-ring ${
        edge === 'start' ? 'left-0' : 'right-0'
      }`}
      onMouseDown={handleMouseDown}
      role="slider"
      tabIndex={0}
      aria-label={label ?? `Drag to resize ${edge}`}
      aria-orientation="horizontal"
    >
      <div
        className={`absolute top-1/2 -translate-y-1/2 w-1 h-4 bg-white/50 rounded ${
          edge === 'start' ? 'left-0.5' : 'right-0.5'
        }`}
        aria-hidden="true"
      />
    </div>
  );
}
