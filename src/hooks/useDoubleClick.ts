import { useCallback, useRef } from 'react';

/**
 * Hook to distinguish single clicks from double clicks.
 * Delays single-click handler to detect if a double-click follows.
 *
 * Returns a unified click handler that dispatches to onClick or onDoubleClick.
 * Also returns a cancel function and a hasDragged ref for drag integration.
 */
export function useDoubleClick(
  onClick: (e: React.MouseEvent) => void,
  onDoubleClick: (e: React.MouseEvent) => void,
  delay: number = 200
): {
  handleClick: (e: React.MouseEvent) => void;
  handleDoubleClick: (e: React.MouseEvent) => void;
  hasDragged: React.MutableRefObject<boolean>;
} {
  const clickTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingEvent = useRef<React.MouseEvent | null>(null);
  const hasDragged = useRef(false);

  const handleClick = useCallback(
    (e: React.MouseEvent): void => {
      // Don't trigger if just finished dragging
      if (hasDragged.current) {
        hasDragged.current = false;
        return;
      }

      // Store the event and delay to detect double-click
      pendingEvent.current = e;

      if (clickTimeoutRef.current) {
        clearTimeout(clickTimeoutRef.current);
      }

      clickTimeoutRef.current = setTimeout(() => {
        if (pendingEvent.current) {
          onClick(pendingEvent.current);
          pendingEvent.current = null;
        }
      }, delay);
    },
    [onClick, delay]
  );

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent): void => {
      e.stopPropagation();
      e.preventDefault();

      // Cancel any pending single-click
      if (clickTimeoutRef.current) {
        clearTimeout(clickTimeoutRef.current);
        clickTimeoutRef.current = null;
      }
      pendingEvent.current = null;
      hasDragged.current = false;

      onDoubleClick(e);
    },
    [onDoubleClick]
  );

  return { handleClick, handleDoubleClick, hasDragged };
}
