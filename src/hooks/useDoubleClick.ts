import { useCallback, useEffect, useRef } from 'react';

/**
 * Telling a click from the first half of a double-click.
 *
 * The delay is a cost, not a feature: for as long as it runs the user has
 * pressed something and nothing has happened. So it is only ever paid where a
 * double-click actually does something — a bar with no children has nothing to
 * open, and there the single click fires on the spot.
 *
 * Whatever a press can show for free should be shown before any of this. That
 * is what `onPress` is for: it runs on mousedown, ahead of the ambiguity, and
 * is where the selection outline belongs.
 */

/** How long a second click has to arrive. Below the ~250ms most people manage. */
const DEFAULT_DELAY_MS = 200;

interface UseDoubleClickOptions {
  /**
   * Whether a double-click has anything to do here. False fires the single
   * click immediately — there is nothing to wait for.
   */
  readonly hasDoubleClickAction?: boolean;
  readonly delay?: number;
}

interface UseDoubleClickReturn {
  handleClick: (e: React.MouseEvent) => void;
  handleDoubleClick: (e: React.MouseEvent) => void;
  hasDragged: React.MutableRefObject<boolean>;
}

export function useDoubleClick(
  onClick: (e: React.MouseEvent) => void,
  onDoubleClick: (e: React.MouseEvent) => void,
  options: UseDoubleClickOptions = {}
): UseDoubleClickReturn {
  const { hasDoubleClickAction = true, delay = DEFAULT_DELAY_MS } = options;

  const clickTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingEvent = useRef<React.MouseEvent | null>(null);
  const hasDragged = useRef(false);

  useEffect(
    () => () => {
      if (clickTimeoutRef.current) clearTimeout(clickTimeoutRef.current);
    },
    []
  );

  const handleClick = useCallback(
    (e: React.MouseEvent): void => {
      // Don't trigger if just finished dragging
      if (hasDragged.current) {
        hasDragged.current = false;
        return;
      }

      // Nothing to disambiguate against — do not make the user wait for it
      if (!hasDoubleClickAction) {
        onClick(e);
        return;
      }

      // React pools nothing here, but the event is only read after the delay
      pendingEvent.current = e;

      if (clickTimeoutRef.current) {
        clearTimeout(clickTimeoutRef.current);
      }

      clickTimeoutRef.current = setTimeout(() => {
        clickTimeoutRef.current = null;
        if (pendingEvent.current) {
          onClick(pendingEvent.current);
          pendingEvent.current = null;
        }
      }, delay);
    },
    [onClick, delay, hasDoubleClickAction]
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
