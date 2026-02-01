import { useState, useCallback, useRef, useEffect } from 'react';

interface DragReorderState {
  isDragging: boolean;
  dragIndex: number | null;
  dropIndex: number | null;
}

interface UseDragReorderOptions {
  onReorder: (fromIndex: number, toIndex: number) => void;
  itemCount: number;
  rowHeight: number;
}

interface UseDragReorderReturn {
  state: DragReorderState;
  handleDragStart: (index: number, e: React.MouseEvent) => void;
  getDragHandleProps: (index: number) => {
    onMouseDown: (e: React.MouseEvent) => void;
    style: React.CSSProperties;
  };
  getDropIndicatorStyle: () => React.CSSProperties | null;
}

export function useDragReorder({
  onReorder,
  itemCount,
  rowHeight,
}: UseDragReorderOptions): UseDragReorderReturn {
  const [state, setState] = useState<DragReorderState>({
    isDragging: false,
    dragIndex: null,
    dropIndex: null,
  });

  const startY = useRef(0);
  const containerRef = useRef<HTMLElement | null>(null);

  const handleDragStart = useCallback(
    (index: number, e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      startY.current = e.clientY;
      containerRef.current = (e.target as HTMLElement).closest('[data-drag-container]');

      setState({
        isDragging: true,
        dragIndex: index,
        dropIndex: index,
      });

      document.body.classList.add('no-select');
    },
    []
  );

  useEffect(() => {
    if (!state.isDragging) return;

    const handleMouseMove = (e: MouseEvent): void => {
      if (state.dragIndex === null) return;

      const deltaY = e.clientY - startY.current;
      const newIndex = Math.max(
        0,
        Math.min(itemCount - 1, state.dragIndex + Math.round(deltaY / rowHeight))
      );

      if (newIndex !== state.dropIndex) {
        setState((prev) => ({
          ...prev,
          dropIndex: newIndex,
        }));
      }
    };

    const handleMouseUp = (): void => {
      if (state.dragIndex !== null && state.dropIndex !== null && state.dragIndex !== state.dropIndex) {
        onReorder(state.dragIndex, state.dropIndex);
      }

      setState({
        isDragging: false,
        dragIndex: null,
        dropIndex: null,
      });

      document.body.classList.remove('no-select');
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [state.isDragging, state.dragIndex, state.dropIndex, itemCount, rowHeight, onReorder]);

  const getDragHandleProps = useCallback(
    (index: number) => ({
      onMouseDown: (e: React.MouseEvent) => handleDragStart(index, e),
      style: {
        cursor: state.isDragging ? 'grabbing' : 'grab',
      } as React.CSSProperties,
    }),
    [handleDragStart, state.isDragging]
  );

  const getDropIndicatorStyle = useCallback((): React.CSSProperties | null => {
    if (!state.isDragging || state.dropIndex === null || state.dropIndex === state.dragIndex) {
      return null;
    }

    const top = state.dropIndex * rowHeight + (state.dropIndex > (state.dragIndex ?? 0) ? rowHeight : 0);

    return {
      position: 'absolute',
      left: 0,
      right: 0,
      top: `${top}px`,
      height: '2px',
      backgroundColor: 'var(--color-focus)',
      zIndex: 50,
      pointerEvents: 'none',
    };
  }, [state.isDragging, state.dropIndex, state.dragIndex, rowHeight]);

  return {
    state,
    handleDragStart,
    getDragHandleProps,
    getDropIndicatorStyle,
  };
}
