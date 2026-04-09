import { useRef, useCallback, useEffect, useState } from 'react';

const PAN_THRESHOLD = 3;
const PAN_DECISION_MS = 300;

interface UseTimelinePanOptions {
  containerRef: React.RefObject<HTMLDivElement | null>;
  startPlayhead: (clientX: number, clientY: number) => void;
}

interface UseTimelinePanReturn {
  isPanning: boolean;
  handleContentMouseDown: (e: React.MouseEvent) => void;
}

export function useTimelinePan({
  containerRef,
  startPlayhead,
}: UseTimelinePanOptions): UseTimelinePanReturn {
  const [isPanning, setIsPanning] = useState(false);
  const isPanningRef = useRef(false);
  const lastPosRef = useRef({ x: 0, y: 0 });
  const pendingRef = useRef<{
    startX: number;
    startY: number;
    timeoutId: number;
  } | null>(null);

  const cancelPending = useCallback(() => {
    if (pendingRef.current) {
      window.clearTimeout(pendingRef.current.timeoutId);
      pendingRef.current = null;
    }
  }, []);

  const startPan = useCallback(
    (clientX: number, clientY: number) => {
      cancelPending();
      isPanningRef.current = true;
      setIsPanning(true);
      lastPosRef.current = { x: clientX, y: clientY };
    },
    [cancelPending]
  );

  // Left-click on background: pending state → pan or playhead
  const handleContentMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return;

      e.preventDefault();
      document.body.classList.add('no-select');

      const startX = e.clientX;
      const startY = e.clientY;

      const timeoutId = window.setTimeout(() => {
        pendingRef.current = null;
        startPlayhead(startX, startY);
      }, PAN_DECISION_MS);

      pendingRef.current = { startX, startY, timeoutId };
    },
    [startPlayhead]
  );

  // Middle-mouse: capture phase on scroll container for immediate pan
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleMouseDownCapture = (e: MouseEvent) => {
      if (e.button !== 1) return;

      e.preventDefault();
      e.stopPropagation();
      document.body.classList.add('no-select');
      startPan(e.clientX, e.clientY);
    };

    container.addEventListener('mousedown', handleMouseDownCapture, true);
    return () => {
      container.removeEventListener('mousedown', handleMouseDownCapture, true);
    };
  }, [containerRef, startPan]);

  // Document-level mousemove and mouseup
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      // Pending: check if movement exceeds threshold → start pan
      if (pendingRef.current) {
        const dx = e.clientX - pendingRef.current.startX;
        const dy = e.clientY - pendingRef.current.startY;
        if (Math.abs(dx) > PAN_THRESHOLD || Math.abs(dy) > PAN_THRESHOLD) {
          startPan(e.clientX, e.clientY);
        }
        return;
      }

      // Active pan
      if (!isPanningRef.current || !containerRef.current) return;

      const deltaX = e.clientX - lastPosRef.current.x;
      const deltaY = e.clientY - lastPosRef.current.y;

      containerRef.current.scrollLeft -= deltaX;
      containerRef.current.scrollTop -= deltaY;

      lastPosRef.current = { x: e.clientX, y: e.clientY };
    };

    const handleMouseUp = () => {
      if (pendingRef.current) {
        cancelPending();
        document.body.classList.remove('no-select');
        return;
      }

      if (isPanningRef.current) {
        isPanningRef.current = false;
        setIsPanning(false);
        document.body.classList.remove('no-select');
      }
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      if (isPanningRef.current || pendingRef.current) {
        cancelPending();
        isPanningRef.current = false;
        document.body.classList.remove('no-select');
      }
    };
  }, [containerRef, startPan, cancelPending]);

  return { isPanning, handleContentMouseDown };
}
