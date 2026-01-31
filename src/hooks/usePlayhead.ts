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

export function usePlayhead({
  timelineWidth,
  containerRef,
}: UsePlayheadOptions): UsePlayheadReturn {
  const { playheadPosition, setPlayheadPosition } = useUIStore();
  const isActiveRef = useRef(false);

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

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      // Only respond to left mouse button
      if (e.button !== 0) return;

      isActiveRef.current = true;
      const position = getRelativePosition(e.clientX);
      setPlayheadPosition(position);
      document.body.classList.add('no-select');
    },
    [getRelativePosition, setPlayheadPosition]
  );

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isActiveRef.current) return;

      const position = getRelativePosition(e.clientX);
      setPlayheadPosition(position);
    };

    const handleMouseUp = () => {
      if (!isActiveRef.current) return;

      isActiveRef.current = false;
      setPlayheadPosition(null);
      document.body.classList.remove('no-select');
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [getRelativePosition, setPlayheadPosition]);

  return {
    isActive: isActiveRef.current,
    playheadPosition,
    handleMouseDown,
  };
}
