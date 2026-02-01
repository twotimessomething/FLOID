import { useRef, useCallback, useEffect } from 'react';
import { useUIStore } from '../stores/uiStore';
import { getRelativeFromPosition } from '../utils/timelineUtils';

interface UsePlayheadOptions {
  timelineWidth: number;
  containerRef: React.RefObject<HTMLDivElement>;
}

interface UsePlayheadReturn {
  isActive: boolean;
  playheadPosition: number | null;
  handleMouseDown: (e: React.MouseEvent) => void;
}

const PLAYHEAD_DELAY_MS = 300;

export function usePlayhead({
  timelineWidth,
  containerRef,
}: UsePlayheadOptions): UsePlayheadReturn {
  const { playheadPosition, setPlayheadPosition } = useUIStore();
  const isActiveRef = useRef(false);
  const delayTimeoutRef = useRef<number | null>(null);
  const pendingPositionRef = useRef<{ x: number; y: number } | null>(null);

  const getRelativePosition = useCallback(
    (clientX: number): number => {
      if (!containerRef.current) return 0;

      const rect = containerRef.current.getBoundingClientRect();
      const scrollLeft = containerRef.current.scrollLeft;
      const x = clientX - rect.left + scrollLeft;

      return getRelativeFromPosition(x, timelineWidth);
    },
    [containerRef, timelineWidth]
  );

  const getYPosition = useCallback(
    (clientY: number): number => {
      if (!containerRef.current) return 0;

      const rect = containerRef.current.getBoundingClientRect();
      const scrollTop = containerRef.current.scrollTop;
      return clientY - rect.top + scrollTop;
    },
    [containerRef]
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      // Only respond to left mouse button
      if (e.button !== 0) return;

      isActiveRef.current = true;
      document.body.classList.add('no-select');

      // Store the initial position for use after the delay
      const position = getRelativePosition(e.clientX);
      const y = getYPosition(e.clientY);
      pendingPositionRef.current = { x: position, y };

      // Delay showing the playhead to distinguish click from click-and-hold
      delayTimeoutRef.current = window.setTimeout(() => {
        if (pendingPositionRef.current) {
          setPlayheadPosition(pendingPositionRef.current.x, pendingPositionRef.current.y);
        }
        delayTimeoutRef.current = null;
      }, PLAYHEAD_DELAY_MS);
    },
    [getRelativePosition, getYPosition, setPlayheadPosition]
  );

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isActiveRef.current) return;

      const position = getRelativePosition(e.clientX);
      const y = getYPosition(e.clientY);

      // If still in delay period, update pending position
      if (delayTimeoutRef.current !== null) {
        pendingPositionRef.current = { x: position, y };
      } else {
        // Delay has passed, update position directly
        setPlayheadPosition(position, y);
      }
    };

    const handleMouseUp = () => {
      if (!isActiveRef.current) return;

      // Clear the delay timeout if it hasn't fired yet
      if (delayTimeoutRef.current !== null) {
        window.clearTimeout(delayTimeoutRef.current);
        delayTimeoutRef.current = null;
      }

      isActiveRef.current = false;
      pendingPositionRef.current = null;
      setPlayheadPosition(null, null);
      document.body.classList.remove('no-select');
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      // Clean up timeout on unmount
      if (delayTimeoutRef.current !== null) {
        window.clearTimeout(delayTimeoutRef.current);
      }
    };
  }, [getRelativePosition, getYPosition, setPlayheadPosition]);

  return {
    isActive: isActiveRef.current,
    playheadPosition,
    handleMouseDown,
  };
}
