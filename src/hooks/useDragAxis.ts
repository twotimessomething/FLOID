import { useCallback, useRef } from 'react';

const AXIS_THRESHOLD = 5;

interface UseDragAxisOptions {
  readonly onHorizontalDrag: (startX: number) => void;
  readonly onVerticalDrag: (startY: number) => void;
  readonly disabled?: boolean;
}

export function useDragAxis({
  onHorizontalDrag,
  onVerticalDrag,
  disabled,
}: UseDragAxisOptions): (e: React.MouseEvent) => void {
  const pendingRef = useRef(false);
  const startRef = useRef({ x: 0, y: 0 });

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (disabled) return;
      e.preventDefault();
      e.stopPropagation();
      pendingRef.current = true;
      startRef.current = { x: e.clientX, y: e.clientY };
      document.body.classList.add('no-select');

      const onMove = (me: MouseEvent): void => {
        if (!pendingRef.current) return;
        const dx = Math.abs(me.clientX - startRef.current.x);
        const dy = Math.abs(me.clientY - startRef.current.y);
        if (dx < AXIS_THRESHOLD && dy < AXIS_THRESHOLD) return;

        pendingRef.current = false;
        cleanup();

        if (dy > dx) {
          onVerticalDrag(startRef.current.y);
        } else {
          onHorizontalDrag(startRef.current.x);
        }
      };

      const onUp = (): void => {
        pendingRef.current = false;
        document.body.classList.remove('no-select');
        cleanup();
      };

      const cleanup = (): void => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    },
    [disabled, onHorizontalDrag, onVerticalDrag]
  );

  return handleMouseDown;
}
