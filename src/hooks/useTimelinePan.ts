import { useRef, useCallback, useEffect, useState } from 'react';

const PAN_THRESHOLD = 3;

interface UseTimelinePanOptions {
  containerRef: React.RefObject<HTMLDivElement | null>;
}

interface UseTimelinePanReturn {
  isPanning: boolean;
}

export function useTimelinePan({
  containerRef,
}: UseTimelinePanOptions): UseTimelinePanReturn {
  const [isPanning, setIsPanning] = useState(false);
  const isPanningRef = useRef(false);
  const lastPosRef = useRef({ x: 0, y: 0 });
  const pendingRef = useRef<{ startX: number; startY: number } | null>(null);
  const didPanRef = useRef(false);

  const startPan = useCallback((clientX: number, clientY: number) => {
    isPanningRef.current = true;
    setIsPanning(true);
    lastPosRef.current = { x: clientX, y: clientY };
  }, []);

  // Capture-phase mousedown for middle and right buttons on scroll container
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleMouseDownCapture = (e: MouseEvent): void => {
      if (e.button === 1) {
        // Middle button: immediate pan
        e.preventDefault();
        e.stopPropagation();
        document.body.classList.add('no-select');
        startPan(e.clientX, e.clientY);
        return;
      }

      if (e.button === 2) {
        // Right button: pending — becomes pan on movement, contextmenu otherwise
        pendingRef.current = { startX: e.clientX, startY: e.clientY };
        didPanRef.current = false;
      }
    };

    container.addEventListener('mousedown', handleMouseDownCapture, true);
    return () => {
      container.removeEventListener('mousedown', handleMouseDownCapture, true);
    };
  }, [containerRef, startPan]);

  // Document-level mousemove/mouseup for pan + contextmenu suppression
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent): void => {
      if (pendingRef.current) {
        const dx = e.clientX - pendingRef.current.startX;
        const dy = e.clientY - pendingRef.current.startY;
        if (Math.abs(dx) > PAN_THRESHOLD || Math.abs(dy) > PAN_THRESHOLD) {
          document.body.classList.add('no-select');
          startPan(e.clientX, e.clientY);
          didPanRef.current = true;
          pendingRef.current = null;
        }
        return;
      }

      if (!isPanningRef.current || !containerRef.current) return;

      const deltaX = e.clientX - lastPosRef.current.x;
      const deltaY = e.clientY - lastPosRef.current.y;

      containerRef.current.scrollLeft -= deltaX;
      containerRef.current.scrollTop -= deltaY;

      lastPosRef.current = { x: e.clientX, y: e.clientY };
    };

    const handleMouseUp = (): void => {
      pendingRef.current = null;

      if (isPanningRef.current) {
        isPanningRef.current = false;
        setIsPanning(false);
        document.body.classList.remove('no-select');
      }

      // If a right-button pan occurred, suppress the trailing contextmenu event
      if (didPanRef.current) {
        const suppressContextMenu = (evt: MouseEvent): void => {
          evt.preventDefault();
          evt.stopPropagation();
          window.removeEventListener('contextmenu', suppressContextMenu, true);
        };
        window.addEventListener('contextmenu', suppressContextMenu, true);
        // Safety cleanup in case no contextmenu event fires
        window.setTimeout(() => {
          window.removeEventListener('contextmenu', suppressContextMenu, true);
        }, 100);
        didPanRef.current = false;
      }
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      if (isPanningRef.current) {
        isPanningRef.current = false;
        document.body.classList.remove('no-select');
      }
    };
  }, [containerRef, startPan]);

  return { isPanning };
}
