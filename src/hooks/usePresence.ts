import { useEffect, useRef, useState } from 'react';

/**
 * Keeping a surface on screen long enough to leave.
 *
 * React unmounts the frame a flag flips, which is why a surface can rise in
 * politely and then simply stop existing. This holds the last frame for the
 * length of the exit and reports which half of the transition the surface is
 * in, so a single class swap covers both directions.
 *
 * A user who has asked for less motion is not asked to wait out an animation
 * they will not see: there, the exit takes no time at all.
 */

/** Must match the exit animations in `index.css`. */
export const MODAL_EXIT_MS = 120;
export const POPOVER_EXIT_MS = 100;

interface Presence {
  /** Whether to render at all — true through the exit, false once it is done. */
  readonly isMounted: boolean;
  /** True only while the surface is on its way out. */
  readonly isLeaving: boolean;
}

export function usePresence(isOpen: boolean, exitMs: number = MODAL_EXIT_MS): Presence {
  const [isMounted, setIsMounted] = useState(isOpen);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    if (isOpen) {
      setIsMounted(true);
      return;
    }

    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    if (reduced) {
      setIsMounted(false);
      return;
    }

    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      setIsMounted(false);
    }, exitMs);

    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [isOpen, exitMs]);

  return { isMounted, isLeaving: isMounted && !isOpen };
}
