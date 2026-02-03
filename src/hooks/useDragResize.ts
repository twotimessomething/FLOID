import { useCallback, useRef, useState } from 'react';
import { useSectionStore } from '../stores/sectionStore';

interface UseDragResizeOptions {
  onDragStart?: () => void;
  onDrag: (deltaX: number) => void;
  onDragEnd?: () => void;
}

export function useDragResize({ onDragStart, onDrag, onDragEnd }: UseDragResizeOptions) {
  const [isDragging, setIsDragging] = useState(false);
  const lastX = useRef(0);

  const beginDragTransaction = useSectionStore((state) => state.beginDragTransaction);
  const commitDragTransaction = useSectionStore((state) => state.commitDragTransaction);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      setIsDragging(true);
      lastX.current = e.clientX;

      // Begin undo transaction before any state changes
      beginDragTransaction();

      onDragStart?.();
      document.body.classList.add('no-select');

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const deltaX = moveEvent.clientX - lastX.current;
        lastX.current = moveEvent.clientX;
        onDrag(deltaX);
      };

      const handleMouseUp = () => {
        setIsDragging(false);

        // Commit transaction to create single undo entry
        commitDragTransaction();

        onDragEnd?.();
        document.body.classList.remove('no-select');
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    },
    [beginDragTransaction, commitDragTransaction, onDragStart, onDrag, onDragEnd]
  );

  return {
    isDragging,
    handleMouseDown,
  };
}
