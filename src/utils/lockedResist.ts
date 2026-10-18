import { prefersReducedMotion } from './easing';

/**
 * A locked item, asked to move, says no where the hand can see it.
 *
 * Doing nothing reads as the app not listening — the pointer moves, the bar
 * does not, and nothing says why. A short nudge against the direction of the
 * pull, once, is the refusal: the thing heard the drag and will not go. It
 * never travels more than a few pixels and never changes anything.
 */

/** Movement, in px, before a press on a locked item counts as a pull. */
const PULL_THRESHOLD_PX = 4;
const NUDGE_MS = 260;

function nudge(element: HTMLElement, direction: number): void {
  if (prefersReducedMotion() || typeof element.animate !== 'function') return;
  const offset = (px: number): Keyframe => ({ transform: `translateX(${px * direction}px)` });
  element.animate([offset(0), offset(4), offset(-3), offset(1.5), offset(0)], {
    duration: NUDGE_MS,
    easing: 'ease-out',
  });
}

export function resistLockedDrag(event: React.PointerEvent, element: HTMLElement): void {
  if (event.button !== 0 || event.ctrlKey) return;
  // A press on a locked row would otherwise start sweeping a text selection
  event.preventDefault();
  const { pointerId, clientX: startX, clientY: startY } = event;

  const cleanup = (): void => {
    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerup', onEnd);
    document.removeEventListener('pointercancel', onEnd);
  };

  const onMove = (moveEvent: PointerEvent): void => {
    if (moveEvent.pointerId !== pointerId) return;
    const dx = moveEvent.clientX - startX;
    if (Math.hypot(dx, moveEvent.clientY - startY) < PULL_THRESHOLD_PX) return;
    cleanup();
    nudge(element, dx < 0 ? -1 : 1);
  };

  const onEnd = (endEvent: PointerEvent): void => {
    if (endEvent.pointerId === pointerId) cleanup();
  };

  document.addEventListener('pointermove', onMove);
  document.addEventListener('pointerup', onEnd);
  document.addEventListener('pointercancel', onEnd);
}
